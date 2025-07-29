const loginBtn = document.getElementById('login');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const messageDiv = document.getElementById('message');

loginBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    messageDiv.textContent = 'Пожалуйста, заполните все поля.';
    return;
  }

  try {
    const res = await fetch('http://localhost:3000/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (data.success) {
      messageDiv.textContent = '✅ Успешный вход!';
      // TODO: Запуск Minecraft клиента или переход к следующему экрану
    } else {
      messageDiv.textContent = '❌ Ошибка: ' + (data.message || 'Неверные данные');
    }
  } catch (e) {
    console.error('Ошибка связи с сервером:', e);
    messageDiv.textContent = 'Ошибка связи с сервером.';
  }
});

fetch('https://api.minimax.chat/v1/user/info', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer sk-cp-e6WVIE6k2uQ6FwQRe82XcIj79A-rLfQb0Bz0dqU4shIP9fLsa4aWAUoBwmvQ4zUZhdMitF01u8qAjH6qI4q-LYsZgfLSda4sCVVGWWAIC9K0ji_oT1qLccU'
  }
})
  .then(r => r.text())
  .then(console.log)
  .catch(console.error);

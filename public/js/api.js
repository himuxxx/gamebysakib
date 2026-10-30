const api = {
  async get(path) {
    const r = await fetch(path, { credentials: 'include' });
    if (r.status === 401) { location.href = '/login.html'; throw new Error('auth'); }
    if (!r.ok) throw new Error((await r.json()).error || 'request failed');
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(path, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (r.status === 401) { location.href = '/login.html'; throw new Error('auth'); }
    if (!r.ok) throw new Error((await r.json()).error || 'request failed');
    return r.json();
  },
};

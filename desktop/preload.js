const { contextBridge, shell } = require('electron');

const state = {
  backendHost: process.env.EKUPKARAN_BACKEND || 'http://127.0.0.1:9000',
};

function toAbsoluteUrl(path) {
  if (!path) {
    return state.backendHost;
  }
  try {
    return new URL(path, state.backendHost).toString();
  } catch (error) {
    console.error('Failed to resolve URL', error);
    return `${state.backendHost}${path}`;
  }
}

async function request(path, options = {}) {
  const url = toAbsoluteUrl(path);
  const init = { ...options };
  init.headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const response = await fetch(url, init);
  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  if (!response.ok) {
    const err = new Error(`Request failed: ${response.status}`);
    err.status = response.status;
    err.payload = data;
    throw err;
  }
  return data;
}

contextBridge.exposeInMainWorld('ekupkaran', {
  getBackendHost: () => state.backendHost,
  setBackendHost: (host) => {
    state.backendHost = host;
    return state.backendHost;
  },
  request,
  openExternal: (url) => shell.openExternal(url),
});

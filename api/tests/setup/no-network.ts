// Tests never touch the network: code that needs HTTP receives a fake fetch.
globalThis.fetch = () =>
  Promise.reject(new Error('Network is blocked in tests: inject a fake fetch'));

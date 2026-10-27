(() => {
  function area(storage, prefix) {
    return {
      async get(key) {
        const raw = storage.getItem(`${prefix}${key}`);
        return { [key]: raw ? JSON.parse(raw) : undefined };
      },
      async set(values) {
        for (const [key, value] of Object.entries(values)) {
          storage.setItem(`${prefix}${key}`, JSON.stringify(value));
        }
      },
      async remove(key) {
        storage.removeItem(`${prefix}${key}`);
      },
    };
  }

  globalThis.browser = {
    storage: {
      local: area(localStorage, "burrowmarks-fixture-local:"),
      session: area(sessionStorage, "burrowmarks-fixture-session:"),
    },
    tabs: {
      async create({ url } = {}) {
        globalThis.__burrowmarksLastOpenedUrl = url || "";
        if (url) window.open(url, "_blank", "noopener");
      },
    },
    downloads: { async download() { return 1; } },
    runtime: {
      getURL(path) { return new URL(path, location.href).href; },
      getManifest() { return { version: "0.1.2" }; },
      async sendMessage() {},
    },
  };
})();

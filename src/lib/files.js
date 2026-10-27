const browser = globalThis.browser ?? globalThis.chrome;

export function downloadText(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  return browser.downloads
    .download({ url, filename, saveAs: true })
    .finally(() => setTimeout(() => URL.revokeObjectURL(url), 5_000));
}

export function readJsonFile(file) {
  return file.text().then((text) => JSON.parse(text));
}

export function readTextFile(file) {
  if (!file) throw new Error("Choose a file first.");
  return file.text();
}

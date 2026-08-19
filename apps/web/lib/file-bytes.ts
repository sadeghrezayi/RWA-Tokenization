// K-33: a document's bytes, for an API that takes base64 in JSON.
//
// The dossier is the evidence a token is backed by an enforceable right, so
// what gets stored has to be the file the person chose — not a string derived
// from its title, which is what this platform stored until 2026-08-19.
//
// FileReader rather than `file.arrayBuffer()`: jsdom does not implement
// arrayBuffer on File, so that version passed in a browser and could not be
// tested at all. Reading as a data URL also hands back base64 directly, with
// no manual chunking to blow the call stack on a multi-megabyte deed.
export const base64Of = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error(`could not read "${file.name}"`));
    };
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      // "data:<mime>;base64,<payload>" — the payload is what the API wants.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });

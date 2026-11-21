// Everything the page needs from the browser. Storage can throw (blocked cookies, private windows),
// so every access is caught and the game carries on without it.
window.lastBreath = {
    read(key) {
        try { return localStorage.getItem(key); } catch { return null; }
    },

    write(key, value) {
        try { localStorage.setItem(key, value); } catch { }
    },

    prefersReducedMotion() {
        return matchMedia("(prefers-reduced-motion: reduce)").matches;
    },

    queryValue(name) {
        return new URLSearchParams(location.search).get(name);
    },

    randomSeed() {
        const words = new Uint32Array(2);
        crypto.getRandomValues(words);
        return ((BigInt(words[0]) << 32n) | BigInt(words[1])).toString();
    },
};

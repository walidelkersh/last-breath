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

    // Shortcuts are page-wide. An open dialog takes its own keys, including Escape.
    listenKeys(game) {
        document.addEventListener("keydown", (event) => {
            if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
            if (document.querySelector("dialog[open]")) return;
            game.invokeMethodAsync("OnKey", event.key);
        });
    },

    openDialog(dialog) {
        if (!dialog.open) dialog.showModal();
    },

    randomSeed() {
        const words = new Uint32Array(2);
        crypto.getRandomValues(words);
        return ((BigInt(words[0]) << 32n) | BigInt(words[1])).toString();
    },
};

// The art sprite goes into the page itself, not into an <img>, so that its colours come from the page's CSS variables
// and follow the theme. A failed request leaves the game playable, with text on the plain page colours.
fetch("art/sprite.svg")
    .then((response) => (response.ok ? response.text() : ""))
    .then((sprite) => document.body.insertAdjacentHTML("afterbegin", sprite))
    .catch(() => { });

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

    // Writes into the text node that Blazor owns, so its next update still lands on it. Called only when motion is allowed.
    countUp(element, from, to, ms) {
        cancelAnimationFrame(element.countFrame);
        const text = element.firstChild;
        const credits = (value) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        // A frame's timestamp can be older than this call, so the clock is clamped.
        const started = performance.now();
        text.nodeValue = credits(from);
        const step = (now) => {
            const done = Math.min(1, Math.max(0, (now - started) / ms));
            text.nodeValue = credits(from + (to - from) * (1 - (1 - done) ** 3));
            if (done < 1) element.countFrame = requestAnimationFrame(step);
        };
        element.countFrame = requestAnimationFrame(step);
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

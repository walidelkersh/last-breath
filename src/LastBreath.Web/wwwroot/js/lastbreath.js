const credits = (value) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// The counts that are running, each with the value it ends on.
const counting = new Map();

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
        // A frame's timestamp can be older than this call, so the clock is clamped.
        const started = performance.now();
        text.nodeValue = credits(from);
        counting.set(element, to);
        const step = (now) => {
            const done = Math.min(1, Math.max(0, (now - started) / ms));
            text.nodeValue = credits(from + (to - from) * (1 - (1 - done) ** 3));
            if (done < 1) element.countFrame = requestAnimationFrame(step);
            else counting.delete(element);
        };
        element.countFrame = requestAnimationFrame(step);
    },

    // Ends every count at once on its last value, for a celebration that is cut short.
    finishCounts() {
        for (const [element, to] of counting) {
            cancelAnimationFrame(element.countFrame);
            if (element.firstChild) element.firstChild.nodeValue = credits(to);
        }
        counting.clear();
    },

    // The page itself never scrolls. What sits between the header and the footer does, on a small screen in the maths view, so a new round
    // starts it at the top.
    toTop() {
        document.querySelector("main")?.scrollTo(0, 0);
    },

    // Brings a block into view only as far as it needs. A block that fits is shown whole, and one that does not starts at the top of the
    // scrolling part, so that it is never cut off at the top.
    reveal(element) {
        const room = element.closest("main")?.clientHeight ?? innerHeight;
        element.scrollIntoView({ block: element.getBoundingClientRect().height <= room ? "nearest" : "start" });
    },

    // Moves focus to a control only when nothing has focus yet, so that a visitor who has already clicked or tabbed somewhere keeps their place.
    focusIfIdle(element) {
        const active = document.activeElement;
        if (!active || active === document.body || active === document.documentElement) element.focus({ preventScroll: true });
    },

    // Closing the panel gives focus back to what had it, or to the control that opened it when nothing did, because a click does not focus a button in
    // every engine and some of them leave focus on the page when a dialog closes.
    openDialog(dialog, opener) {
        if (dialog.open) return;
        const focused = document.activeElement;
        const back = focused && focused !== document.body ? focused : opener;
        dialog.addEventListener("close", () => {
            if (back && back.isConnected) back.focus({ preventScroll: true });
        }, { once: true });
        dialog.showModal();
    },

    randomSeed() {
        const words = new Uint32Array(2);
        crypto.getRandomValues(words);
        return ((BigInt(words[0]) << 32n) | BigInt(words[1])).toString();
    },
};

// The list of keys is a popover. It closes on a click anywhere else and on Escape, and it knows how far from the left it starts so that it
// stays on the screen.
document.addEventListener("click", (event) => {
    const keys = document.querySelector("details.keys[open]");
    if (keys && !keys.contains(event.target)) keys.removeAttribute("open");
});
document.addEventListener("keydown", (event) => {
    const keys = document.querySelector("details.keys[open]");
    if (event.key !== "Escape" || !keys) return;
    keys.removeAttribute("open");
    keys.querySelector("summary").focus({ preventScroll: true });
});
document.addEventListener("toggle", (event) => {
    const keys = event.target;
    if (keys.matches && keys.matches("details.keys") && keys.open) keys.style.setProperty("--keys-left", `${keys.getBoundingClientRect().left}px`);
}, true);

// A card that takes focus from the keyboard is brought into view whole and clear of the bar at the foot. The engines differ in what they scroll to for a
// focused radio that fills a card, and WebKit shows only the top of a card that was out of view, so the script does it for all of them.
document.addEventListener("focusin", (event) => {
    const card = event.target.matches && event.target.matches(".card input") ? event.target.closest(".card") : null;
    if (card) card.scrollIntoView({ block: "nearest" });
});

// The art sprite goes into the page itself, not into an <img>, so that its colours come from the page's CSS variables
// and follow the theme. A failed request leaves the game playable, with text on the plain page colours.
fetch("art/sprite.svg")
    .then((response) => (response.ok ? response.text() : ""))
    .then((sprite) => document.body.insertAdjacentHTML("afterbegin", sprite))
    .catch(() => { });

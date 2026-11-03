/*
 * Plethora Bit host emulator for local browser testing.
 * Emulates SDK 1.7.0 / runtime plethora-bit@2 closely enough to run window.plethoraBit.init(ctx)
 * in a phone-sized frame. It is a test double: browser evidence here never proves native behaviour.
 *
 * One file, two roles:
 *   shell   - the harness page (index.html): phone frame, host decorations (island, home
 *             indicator, logo button), side panel, event log and the window.__harness test hooks.
 *   runtime - the device document (device.html, inside the phone's iframe): builds ctx and runs
 *             the Bit in its own window, so viewport units, window.innerWidth, :root CSS variables
 *             and instanceof checks behave as they do in the phone's WebView.
 *
 * Shapes and names follow the SDK reference (sdk.md). Harness-only behaviour is limited to logging,
 * warnings and test hooks; nothing here adds Bit-facing APIs the real host does not have.
 */
(function () {
  "use strict";

  const ROLE = window.__PLETHORA_DEVICE__ === true ? "runtime" : "shell";
  const SDK_VERSION = "1.7.0";
  const RUNTIME_VERSION = "plethora-bit@2";
  const STORAGE_PREFIX = "plethora-harness:v1:";
  const LOGO_SIZE = 56;
  // Gap between the logo's top edge and the content-safe bottom edge. 108.5 - 34 - 56 - 8 = 10.5 on the
  // iPhone 17 Pro, which puts the logo's bottom edge 8px above the home-indicator inset.
  const LOGO_CONTENT_GAP = 10.5;

  const IPHONE17PRO_SAFE = Object.freeze({ top: 62, right: 0, bottom: 34, left: 0 });
  const IPHONE17PRO_CONTENT = Object.freeze({ top: 62, right: 0, bottom: 108.5, left: 0 });

  const DEVICES = {
    iphone17pro: { label: "iPhone 17 Pro · 402×874", width: 402, height: 874, mode: "fullscreen", chrome: "island", radius: 55, safeArea: IPHONE17PRO_SAFE, contentSafeArea: IPHONE17PRO_CONTENT },
    android3btn: { label: "Android 3-button nav · 412×915", width: 412, height: 915, mode: "fullscreen", chrome: "android", radius: 28, safeArea: { top: 36, right: 0, bottom: 48, left: 0 }, contentSafeArea: { top: 36, right: 0, bottom: 130.5, left: 0 } },
    iphonese: { label: "iPhone SE · 375×667", width: 375, height: 667, mode: "fullscreen", chrome: "homebutton", radius: 0, safeArea: { top: 20, right: 0, bottom: 0, left: 0 }, contentSafeArea: { top: 20, right: 0, bottom: 96, left: 0 } },
    legacy: { label: "Legacy safe frame · 402×754", width: 402, height: 874, mode: "legacy", chrome: "island", radius: 55, containerTop: 62, containerHeight: 754, safeArea: { top: 0, right: 0, bottom: 120, left: 0 } },
    fill: { label: "Fill window · iPhone 17 Pro insets", fill: true, mode: "fullscreen", chrome: "island", radius: 0, safeArea: IPHONE17PRO_SAFE, contentSafeArea: IPHONE17PRO_CONTENT }
  };

  // Documented member names (sdk.md) per namespace: used only to word "not implemented" warnings.
  const DOCUMENTED = {
    ctx: ["container", "width", "height", "dpr", "nativeDpr", "safeArea", "contentSafeArea", "logoArea", "manifest", "runtime", "capabilities", "viewer", "markVisualReady", "onResize", "createRoot", "createCanvas2D", "createCanvas", "surface", "chrome", "fx", "visual", "tune", "onboarding", "input", "listen", "game", "math", "geometry", "platform", "pulse", "share", "onFrame", "raf", "timeout", "interval", "onDestroy", "cleanup", "loadScript", "importModule", "loadFont", "registry", "mediapipe", "fetch", "music", "audio", "camera", "microphone", "storage", "sensors", "motion", "memory", "assets"],
    game: ["loop", "timer", "cooldown", "every", "sequence", "stateMachine", "clamp", "lerp", "approach", "wrap", "bounds", "random", "score", "progress"],
    input: ["track", "on", "activate", "delegate", "zone", "zones", "hitCircle", "hitRect", "hitPolygon", "nearest", "follow", "spring", "inertia", "fling"],
    platform: ["ready", "start", "interact", "setScore", "setProgress", "milestone", "complete", "fail", "error", "emit", "haptic"],
    music: ["presets", "scales", "stings", "unlock", "play", "start", "stop", "pause", "resume", "setVolume", "setPreset", "setTempo", "setIntensity", "setScale", "setPattern", "duck", "sting", "state", "details", "error", "ready", "playing", "preset"],
    memory: ["local", "record", "tally", "world"],
    fx: ["impact", "burst", "ripple", "flash", "floatText", "trail", "pulse", "shake", "transition", "clear", "create"],
    tune: ["get", "number", "integer", "boolean", "choice", "multiChoice", "color", "range", "point2", "vec2", "seed", "durationMs", "percent", "curve", "onChange", "has", "snapshot", "meta", "applyPreset", "reset"],
    visual: ["palette", "kit", "texture", "material", "sprite", "catalog"],
    math: ["clamp", "clamp01", "saturate", "lerp", "invLerp", "unlerp", "remap", "approach", "wrap", "pingPong", "deadzone", "snap", "roundTo", "signNonZero", "mod", "smoothstep", "smootherstep", "smoothDamp", "spring", "angle", "vec2", "vec3", "quat", "random", "noise", "ease", "curve", "envelope", "color"],
    geometry: ["point", "segment", "ray", "normalize", "typeOf", "bounds", "rect", "circle", "ellipse", "triangle", "polygon", "hit", "collision", "intersection", "distance", "nearestPointOnSegment", "projectPointOnLine", "projectPointOnSegment", "projectPointOnRay", "heading", "pointFromHeading", "path", "bezier", "arc", "sample", "transform", "spatialGrid"],
    surface: ["place", "getPlacement", "enableInput"],
    onboarding: ["state", "start", "next", "advance", "complete", "dismiss", "focus", "clearFocus", "replay"],
    audio: ["play", "loop", "stopAll", "reactive"],
    storage: ["get", "set", "remove", "clear"],
    pulse: ["complete"],
    loop: ["frame", "elapsedMs", "timeScale", "isRunning", "isPaused", "stats", "pause", "resume", "stop", "start", "destroy", "step", "resetClock", "setFps", "setTimeScale"],
    score: ["id", "value", "previous", "delta", "lowest", "highest", "initial", "primary", "set", "add", "reset", "flush", "onChange", "submit", "checkpoint", "rank", "leaderboard", "checkpointStatus"],
    tracker: ["x", "y", "dx", "dy", "startX", "startY", "down", "pressed", "released", "tap", "doubleTap", "dragging", "durationMs", "distance", "velocityX", "velocityY", "vector", "swipe", "hold", "primary", "pointers", "pinch", "rotate", "on", "pointer", "destroy", "frameDone", "zone"],
    musicHandle: ["stop", "pause", "resume", "unlock", "setVolume", "setPreset", "setTempo", "setIntensity", "setScale", "setPattern", "duck", "sting", "state", "details", "error", "ready", "playing", "preset"],
    progress: ["load", "save", "complete", "abandon"],
    record: ["submit", "checkpoint", "rank", "leaderboard", "checkpointStatus"]
  };

  // ---------------------------------------------------------------------------------------------
  // Small shared helpers
  // ---------------------------------------------------------------------------------------------
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const hasOwn = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
  const now = () => performance.now();

  function deepFreeze(o) {
    if (o && typeof o === "object" && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const k of Object.keys(o)) deepFreeze(o[k]);
    }
    return o;
  }

  function clone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  function safeJson(value, max) {
    const limit = max || 360;
    const seen = new WeakSet();
    let text;
    try {
      text = JSON.stringify(value, function (key, v) {
        if (typeof v === "function") return "[fn]";
        if (typeof v === "number" && !Number.isFinite(v)) return String(v);
        if (v && typeof v === "object") {
          if (v.nodeType === 1) return "<" + String(v.tagName).toLowerCase() + (v.id ? "#" + v.id : "") + (v.className && typeof v.className === "string" ? "." + v.className.split(/\s+/).filter(Boolean).join(".") : "") + ">";
          if (v.nodeType) return "[node]";
          if (typeof Event !== "undefined" && v instanceof Event) return "[" + v.type + " event]";
          if (seen.has(v)) return "[circular]";
          seen.add(v);
        }
        return v;
      });
    } catch (e) {
      text = "[unserializable: " + (e && e.message) + "]";
    }
    if (text === undefined) text = String(value);
    return text.length > limit ? text.slice(0, limit) + "…" : text;
  }

  function hashString(s) {
    let h = 2166136261 >>> 0;
    const str = String(s);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedToInt(seed) {
    if (seed === undefined || seed === null) return (Math.random() * 4294967296) >>> 0;
    if (typeof seed === "number" && Number.isFinite(seed)) return (Math.floor(seed) >>> 0) ^ 0x9E3779B9;
    return hashString(seed);
  }

  function slug(s) {
    return String(s || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "untitled";
  }

  // Environment (container size, insets, logo) for a device preset. Shared by both roles.
  function computeEnvironment(name, opts) {
    const d = DEVICES[name] || DEVICES.iphone17pro;
    const o = opts || {};
    let screenW = d.fill ? Math.max(240, Math.floor(o.stageWidth || 402)) : d.width;
    const screenH = d.fill ? Math.max(320, Math.floor(o.stageHeight || 874)) : d.height;
    if (o.narrow) screenW = Math.round(screenW * 0.8);
    if (d.mode === "legacy") {
      const width = screenW;
      const height = d.containerHeight;
      const logoRect = { x: (width - LOGO_SIZE) / 2, y: height - d.safeArea.bottom + (d.safeArea.bottom - LOGO_SIZE) / 2, width: LOGO_SIZE, height: LOGO_SIZE };
      return { device: d.fill ? "fill" : name, label: d.label, mode: "legacy", chrome: d.chrome, radius: d.radius, screenWidth: screenW, screenHeight: screenH, containerTop: d.containerTop, width, height, safeArea: Object.assign({}, d.safeArea), contentSafeArea: undefined, logoArea: undefined, logoRect, narrow: !!o.narrow };
    }
    const width = screenW;
    const height = screenH;
    const csa = d.contentSafeArea;
    const logoRect = { x: (width - LOGO_SIZE) / 2, y: height - csa.bottom + LOGO_CONTENT_GAP, width: LOGO_SIZE, height: LOGO_SIZE };
    return { device: name, label: d.label, mode: "fullscreen", chrome: d.chrome, radius: d.radius, screenWidth: screenW, screenHeight: screenH, containerTop: 0, width, height, safeArea: Object.assign({}, d.safeArea), contentSafeArea: Object.assign({}, csa), logoArea: Object.assign({}, logoRect), logoRect, narrow: !!o.narrow };
  }

  // Unknown-member guard: warns once on access, throws a descriptive error when called.
  const SILENT_PROBES = new Set(["then", "toJSON", "nodeType", "$$typeof", "asymmetricMatch", "@@__IMMUTABLE_ITERABLE__@@", "@@__IMMUTABLE_RECORD__@@", "_isMockFunction", "__esModule", "prototype", "inspect", "length", "name"]);

  function makeGuard(warnFn) {
    function missingMember(path, documented) {
      const message = path + " is not implemented in the harness" + (documented ? " (it is documented in SDK " + SDK_VERSION + ", so the real host has it)" : " (and it is not in SDK " + SDK_VERSION + " either: probably an invented API)");
      const fn = function () { throw new Error(message); };
      return new Proxy(fn, {
        get(t, prop) {
          if (typeof prop === "symbol" || SILENT_PROBES.has(prop)) return undefined;
          const child = path + "." + String(prop);
          warnFn("missing:" + child, child + " accessed on an unimplemented member (" + path + ")");
          return missingMember(child, documented);
        },
        apply() {
          warnFn("called:" + path, message);
          throw new Error(message);
        },
        construct() {
          throw new Error(message);
        }
      });
    }
    return function guard(target, path, documentedKey) {
      const documented = DOCUMENTED[documentedKey || path.split(".").pop()] || [];
      return new Proxy(target, {
        get(t, prop, receiver) {
          if (typeof prop === "symbol" || prop in t) return Reflect.get(t, prop, receiver);
          if (SILENT_PROBES.has(prop) || prop === "constructor") return undefined;
          const full = path + "." + prop;
          const isDoc = documented.indexOf(prop) >= 0;
          warnFn("missing:" + full, full + " is not implemented in the harness" + (isDoc ? " (documented in SDK " + SDK_VERSION + "; the real host has it)" : " (not in SDK " + SDK_VERSION + " either: probably an invented API)"));
          return missingMember(full, isDoc);
        }
      });
    };
  }

  // =============================================================================================
  // RUNTIME ROLE: runs inside the device document (device.html) and owns ctx.
  // =============================================================================================
  function createRuntime() {
    const win = window;
    const doc = document;
    const _setTimeout = win.setTimeout.bind(win);
    const _clearTimeout = win.clearTimeout.bind(win);
    const _setInterval = win.setInterval.bind(win);
    const _clearInterval = win.clearInterval.bind(win);
    const _raf = win.requestAnimationFrame.bind(win);
    const _caf = win.cancelAnimationFrame.bind(win);
    const _fetch = win.fetch.bind(win);
    const _AudioContext = win.AudioContext || win.webkitAudioContext;
    const _Audio = win.Audio;
    const container = doc.getElementById("plethora-bit-container");

    const LANES = { background: 100, content: 200, overlay: 300, modal: 400 };
    const LANE_SPAN = 99;
    const VIEWER_ID = "usr_harness_viewer";
    const ZERO_INSETS = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

    let shell = {
      log(kind, msg, data) { console.info("[harness]", kind, msg, data || ""); },
      haptic() {}, status() {}, onboarding() {}, tuneChanged() {}, visualReady() {}, errorCount() {}
    };

    const H = {
      manifest: deepFreeze({}),
      bitKey: "untitled",
      env: computeEnvironment("iphone17pro"),
      insets: null,
      dprOverride: null,
      latencyMs: 600,
      failRecords: false,
      failLocal: false,
      muted: false,
      status: "idle",
      hostPaused: false,
      life: null,
      ctx: null,
      attempt: 0,
      lifeSeq: 0,
      bit: null,
      bitUrl: null,
      errors: 0,
      tune: null,
      onboarding: null,
      music: null,
      fontLoads: [],
      progress: new Map()
    };

    const warned = new Set();
    function log(kind, msg, data) {
      try { shell.log(kind, msg, data === undefined ? "" : safeJson(data)); } catch (e) { console.info("[harness]", kind, msg); }
    }
    function warnOnce(key, msg) {
      if (warned.has(key)) return;
      warned.add(key);
      log("warn", msg);
    }
    const guard = makeGuard(warnOnce);

    function reportError(err, where) {
      H.errors++;
      const message = err && err.message ? err.message : String(err);
      log("error", where + " threw: " + message, err && err.stack ? String(err.stack).split("\n").slice(0, 4).join(" | ") : undefined);
      console.error("[harness] " + where + " threw", err);
      try { shell.errorCount(H.errors); } catch (_) {}
    }
    function guardCall(fn, where, args) {
      try { return fn.apply(undefined, args || []); } catch (e) { reportError(e, where); return undefined; }
    }
    function notAllowed(message) {
      return new DOMException(message, "NotAllowedError");
    }
    function hostError(code, message, extra) {
      const e = new Error(message);
      e.name = "PlethoraError";
      e.code = code;
      if (extra) Object.assign(e, extra);
      return e;
    }
    function hasPerm(p) {
      const list = Array.isArray(H.manifest.permissions) ? H.manifest.permissions : [];
      return list.indexOf(p) >= 0;
    }
    function currentDpr() {
      return H.dprOverride != null ? H.dprOverride : (win.__harnessNativeDpr || 1);
    }

    // ---- errors anywhere in the device document are logged, never silent ----
    win.addEventListener("error", (e) => {
      H.errors++;
      log("error", "Uncaught " + (e.message || "error") + (e.filename ? " @ " + String(e.filename).split("/").pop() + ":" + e.lineno + ":" + e.colno : ""), e.error && e.error.stack ? String(e.error.stack).split("\n").slice(0, 4).join(" | ") : undefined);
      try { shell.errorCount(H.errors); } catch (_) {}
    });
    win.addEventListener("unhandledrejection", (e) => {
      H.errors++;
      const r = e.reason;
      log("error", "Unhandled promise rejection: " + (r && r.message ? (r.code ? "[" + r.code + "] " : "") + r.message : String(r)));
      try { shell.errorCount(H.errors); } catch (_) {}
    });

    // ---- sandbox emulation: the host WebView has no network, workers or raw audio without permission ----
    (function installSandbox() {
      const nativeDpr = win.devicePixelRatio || 1;
      win.__harnessNativeDpr = nativeDpr;
      Object.defineProperty(win, "devicePixelRatio", { configurable: true, get: () => currentDpr() });
      const isLocalUrl = (u) => /^(data:|blob:|about:)/i.test(String(u && u.url ? u.url : u));
      win.fetch = function (input, init) {
        if (isLocalUrl(input)) return _fetch(input, init);
        const url = String(input && input.url ? input.url : input);
        log("error", "Bit called fetch(" + url + "): network egress is denied in the Plethora sandbox (use ctx.fetch for data:/blob: URLs)");
        return Promise.reject(new TypeError("Failed to fetch: network egress is denied in the Plethora sandbox (harness emulation)"));
      };
      const xhrOpen = win.XMLHttpRequest && win.XMLHttpRequest.prototype.open;
      if (xhrOpen) {
        win.XMLHttpRequest.prototype.open = function (method, url) {
          if (!isLocalUrl(url)) {
            log("error", "Bit opened XMLHttpRequest " + method + " " + url + ": network egress is denied in the Plethora sandbox");
            throw new DOMException("Network egress is denied in the Plethora sandbox (harness emulation)", "NetworkError");
          }
          return xhrOpen.apply(this, arguments);
        };
      }
      for (const name of ["WebSocket", "EventSource", "Worker", "SharedWorker"]) {
        if (!win[name]) continue;
        win[name] = function () {
          log("error", "Bit constructed " + name + ": not allowed in the Plethora sandbox (no workers, sockets or hidden network)");
          throw new DOMException(name + " is not allowed in the Plethora sandbox (harness emulation)", "SecurityError");
        };
      }
      if (_AudioContext) {
        const Guarded = function () {
          if (!hasPerm("audio")) {
            log("error", "Bit constructed AudioContext without the \"audio\" permission (raw WebAudio is permission-guarded; prefer ctx.music)");
            throw notAllowed("AudioContext requires the \"audio\" permission");
          }
          warnOnce("raw-audioctx", "Bit created a raw AudioContext; prefer ctx.music/ctx.audio unless it needs bespoke synthesis");
          return Reflect.construct(_AudioContext, Array.from(arguments), new.target || _AudioContext);
        };
        Guarded.prototype = _AudioContext.prototype;
        win.AudioContext = Guarded;
        if (win.webkitAudioContext) win.webkitAudioContext = Guarded;
      }
      if (_Audio) {
        const GuardedAudio = function (src) {
          if (!hasPerm("audio")) {
            log("error", "Bit constructed new Audio() without the \"audio\" permission");
            throw notAllowed("new Audio() requires the \"audio\" permission");
          }
          return new _Audio(src);
        };
        GuardedAudio.prototype = _Audio.prototype;
        win.Audio = GuardedAudio;
      }
      // Raw loops and timers keep running after cleanup; flag them so leaks are visible.
      win.requestAnimationFrame = function (cb) {
        const life = H.life;
        if (life && !life.destroyed && !life.inHostCode) warnOnce("raw-raf", "Bit called requestAnimationFrame directly; prefer ctx.game.loop or one ctx.onFrame (raw recursive rAF loops are not cleanup-owned)");
        return _raf(function (t) {
          if (life && life.destroyed) warnOnce("raf-after-destroy-" + life.id, "A raw requestAnimationFrame callback ran after destroy (leaked loop from a previous init)");
          return cb(t);
        });
      };
      const wrapTimer = (orig, label) => function (fn, ms) {
        const life = H.life;
        if (typeof fn !== "function") return orig.apply(win, arguments);
        const rest = Array.prototype.slice.call(arguments, 2);
        return orig.call(win, function () {
          if (life && life.destroyed) warnOnce(label + "-after-destroy-" + life.id, "A raw " + label + " callback ran after destroy; use ctx.timeout/ctx.interval so cleanup cancels it");
          return fn.apply(this, rest.length ? rest : arguments);
        }, ms);
      };
      win.setTimeout = wrapTimer(_setTimeout, "setTimeout");
      win.setInterval = wrapTimer(_setInterval, "setInterval");
      // Mounting outside ctx surfaces.
      new MutationObserver((records) => {
        for (const r of records) {
          for (const n of r.addedNodes) {
            if (n.nodeType !== 1 || n.__harnessOwned) continue;
            if (n.tagName === "SCRIPT") log("error", "A <script> element was inserted by page code: manual script tags are not allowed on the host (use ctx.loadScript)");
            else if (r.target === doc.body) log("warn", "Bit appended <" + n.tagName.toLowerCase() + "> to document.body; the host only allows ctx surfaces (createRoot/createCanvas2D/createCanvas)");
          }
        }
      }).observe(doc.documentElement, { childList: true, subtree: false });
      new MutationObserver((records) => {
        for (const r of records) for (const n of r.addedNodes) {
          if (n.nodeType !== 1 || n.__harnessOwned) continue;
          if (n.tagName === "SCRIPT") log("error", "A <script> element was inserted by page code: manual script tags are not allowed on the host (use ctx.loadScript)");
          else if (r.target === doc.body) log("warn", "Bit appended <" + n.tagName.toLowerCase() + "> to document.body; the host only allows ctx surfaces (createRoot/createCanvas2D/createCanvas)");
        }
      }).observe(doc.body, { childList: true });
      new MutationObserver((records) => {
        for (const r of records) for (const n of r.addedNodes) {
          if (n.nodeType === 1 && n.tagName === "SCRIPT" && !n.__harnessOwned) log("error", "A <script> element was inserted into <head>: manual script tags are not allowed on the host (use ctx.loadScript)");
        }
      }).observe(doc.head, { childList: true });
      new MutationObserver((records) => {
        const life = H.life;
        if (!life || life.destroyed) return;
        for (const r of records) for (const n of r.addedNodes) {
          if (n.nodeType !== 1 || n.__harnessOwned || life.surfaces.has(n)) continue;
          warnOnce("direct-append", "Bit appended <" + n.tagName.toLowerCase() + "> directly to ctx.container; prefer ctx.createRoot/createCanvas2D/createCanvas (the container is a read-only target)");
        }
      }).observe(container, { childList: true });
    })();

    // ---------------------------------------------------------------------------------------------
    // Environment: insets, CSS variables, resize fan-out
    // ---------------------------------------------------------------------------------------------
    function buildInsets(env) {
      if (env.mode === "legacy") {
        return { safeArea: Object.freeze(Object.assign({}, env.safeArea)), contentSafeArea: undefined, logoArea: undefined };
      }
      return {
        safeArea: Object.freeze(Object.assign({}, env.safeArea)),
        contentSafeArea: Object.freeze(Object.assign({}, env.contentSafeArea)),
        logoArea: env.logoArea ? Object.freeze(Object.assign({}, env.logoArea)) : null
      };
    }
    H.insets = buildInsets(H.env);

    const CSS_VARS = ["top", "right", "bottom", "left"];
    function applyCssVariables() {
      const root = doc.documentElement.style;
      for (const side of CSS_VARS) {
        if (H.env.mode === "fullscreen") {
          root.setProperty("--plethora-safe-" + side, H.env.safeArea[side] + "px");
          root.setProperty("--plethora-content-safe-" + side, H.env.contentSafeArea[side] + "px");
        } else {
          root.removeProperty("--plethora-safe-" + side);
          root.removeProperty("--plethora-content-safe-" + side);
        }
      }
    }
    applyCssVariables();

    function resizePayload() {
      const e = H.env;
      const p = { width: e.width, height: e.height, dpr: currentDpr(), nativeDpr: currentDpr() };
      if (e.mode === "fullscreen") {
        p.safeArea = H.insets.safeArea;
        p.contentSafeArea = H.insets.contentSafeArea;
        p.logoArea = H.insets.logoArea;
      } else {
        // sdk.md: in a safe-frame Bit the callback's own safeArea is all zeros.
        p.safeArea = ZERO_INSETS;
      }
      return p;
    }
    function resizeKey() {
      const e = H.env;
      return [e.mode, e.width, e.height, currentDpr(), safeJson(e.safeArea), safeJson(e.contentSafeArea), safeJson(e.logoArea)].join("|");
    }
    function callResize(sub, payload, immediate) {
      const run = () => { sub.timer = 0; guardCall(sub.cb, "ctx.onResize callback", [payload]); };
      if (sub.debounceMs > 0 && !immediate) {
        if (sub.timer) _clearTimeout(sub.timer);
        sub.timer = _setTimeout(run, sub.debounceMs);
      } else {
        run();
      }
    }
    function emitResize(reason, force) {
      const life = H.life;
      if (!life || life.destroyed) return;
      const key = resizeKey();
      if (!force && key === life.lastResizeKey) return;
      life.lastResizeKey = key;
      resizeSurfaces(life);
      const payload = resizePayload();
      log("lifecycle", "onResize → " + H.env.width + "×" + H.env.height + " dpr " + currentDpr() + " (" + reason + ", " + life.resizeSubs.size + " subscriber" + (life.resizeSubs.size === 1 ? "" : "s") + ")", H.env.mode === "fullscreen" ? { safeArea: payload.safeArea, contentSafeArea: payload.contentSafeArea, logoArea: payload.logoArea } : { mode: "legacy safe frame", ctxSafeArea: H.insets.safeArea, callbackSafeArea: payload.safeArea });
      for (const sub of Array.from(life.resizeSubs)) callResize(sub, payload, false);
    }

    // Catch container size changes that did not come through setEnvironment.
    if (win.ResizeObserver) {
      new ResizeObserver(() => {
        const r = container.getBoundingClientRect();
        const w = Math.round(r.width), h = Math.round(r.height);
        if (w > 0 && h > 0 && (w !== Math.round(H.env.width) || h !== Math.round(H.env.height))) {
          H.env = Object.assign({}, H.env, { width: w, height: h });
          emitResize("container resized", false);
        }
      }).observe(container);
    }

    // ---------------------------------------------------------------------------------------------
    // Lifetime (one per init), ownership and the shared frame scheduler
    // ---------------------------------------------------------------------------------------------
    function createLife() {
      return {
        id: ++H.lifeSeq,
        destroyed: false,
        owned: new Set(),
        destroyCbs: [],
        frameCbs: [],
        loops: new Set(),
        trackers: new Set(),
        surfaces: new Map(),
        resizeSubs: new Set(),
        pending: new Set(),
        scores: new Map(),
        primary: null,
        fxRoot: null,
        animations: new Set(),
        transition: null,
        audioEls: new Set(),
        lastResizeKey: null,
        readyCalled: false,
        visualReady: false,
        inHostCode: false
      };
    }

    function own(life, dispose, kind) {
      let done = false;
      const d = function () {
        if (done) return;
        done = true;
        life.owned.delete(d);
        try { dispose(); } catch (e) { reportError(e, "cleanup (" + kind + ")"); }
      };
      d.kind = kind;
      life.owned.add(d);
      return d;
    }

    function isDead(life, what) {
      if (!life.destroyed) return false;
      warnOnce("dead:" + life.id + ":" + what, what + " was called on a destroyed ctx (init lifetime " + life.id + "); all ctx handles belong to one init lifetime");
      return true;
    }
    function assertAlive(life, what) {
      if (life.destroyed) throw new Error(what + ": this ctx was destroyed (init lifetime " + life.id + "); use the ctx passed to the current init");
    }

    let rafId = 0;
    let lastFrameT = 0;
    function ensureTicking() {
      if (!rafId && H.life && !H.life.destroyed && !H.hostPaused) rafId = _raf(tick);
    }
    function stopTicking() {
      if (rafId) _caf(rafId);
      rafId = 0;
      lastFrameT = 0;
    }
    function tick(t) {
      rafId = 0;
      const life = H.life;
      if (!life || life.destroyed || H.hostPaused) return;
      const dt = lastFrameT ? Math.min(1000, Math.max(0, t - lastFrameT)) : 1000 / 60;
      lastFrameT = t;
      life.inHostCode = true;
      try {
        for (const cb of life.frameCbs.slice()) guardCall(cb, "ctx.onFrame callback", [dt, t]);
        for (const loop of Array.from(life.loops)) loop._tick(t);
        if (life.fxRoot) life.fxRoot._tick(dt);
      } finally {
        life.inHostCode = false;
      }
      if (!life.destroyed && !H.hostPaused) rafId = _raf(tick);
    }

    // ---------------------------------------------------------------------------------------------
    // Surfaces
    // ---------------------------------------------------------------------------------------------
    function normPlacement(opts, prev) {
      const p = Object.assign({ layer: null, order: null, zIndex: null, input: null }, prev || {});
      const o = opts || {};
      if (hasOwn(o, "layer")) {
        if (o.layer != null && !hasOwn(LANES, o.layer)) warnOnce("bad-layer:" + o.layer, "Unknown surface layer \"" + o.layer + "\" (use background | content | overlay | modal); normalized to null");
        p.layer = hasOwn(LANES, o.layer) ? o.layer : null;
      }
      if (hasOwn(o, "order")) {
        const n = Number(o.order);
        p.order = o.order != null && Number.isFinite(n) ? clamp(Math.round(n), -999999, 999999) : null;
      }
      if (hasOwn(o, "zIndex")) {
        const z = Number(o.zIndex);
        p.zIndex = o.zIndex != null && Number.isFinite(z) ? Math.round(z) : null;
      }
      if (hasOwn(o, "input")) {
        p.input = o.input === "passthrough" || o.input === "auto" ? o.input : null;
      } else if (hasOwn(o, "pointerEvents")) {
        p.input = o.pointerEvents === "none" ? "passthrough" : o.pointerEvents === "auto" ? "auto" : p.input;
      }
      return p;
    }
    function hasPlacementOpts(o) {
      return !!o && ["layer", "order", "zIndex", "input", "pointerEvents"].some((k) => hasOwn(o, k));
    }
    function computedZ(p) {
      if (p.zIndex != null) return p.zIndex;
      if (p.layer == null && p.order == null) return null;
      let order = p.order || 0;
      if (Math.abs(order) > LANE_SPAN) {
        warnOnce("order-span", "Surface order " + order + " exceeds the harness lane width (±" + LANE_SPAN + "); clamped so lanes stay ordered (background < content < overlay < modal)");
        order = clamp(order, -LANE_SPAN, LANE_SPAN);
      }
      return LANES[p.layer || "content"] + order;
    }
    function applyPlacement(el, p) {
      const z = computedZ(p);
      el.style.zIndex = z == null ? "" : String(z);
      if (p.input === "passthrough") el.style.pointerEvents = "none";
      else if (p.input === "auto") el.style.pointerEvents = "auto";
    }
    function applyStyle(el, style) {
      if (style == null || style === "") return;
      if (typeof style === "string") {
        el.style.cssText += ";" + style;
        return;
      }
      if (Array.isArray(style)) throw new TypeError("createRoot style: React Native style arrays are not supported; pass a CSS text string");
      if (typeof style === "object") {
        for (const k of Object.keys(style)) {
          const v = style[k];
          if (v == null) continue;
          if (k.indexOf("-") >= 0) el.style.setProperty(k, String(v));
          else el.style[k] = String(v);
        }
      }
    }
    function registerSurface(life, el, kind, opts, rec) {
      const placement = normPlacement(opts, null);
      if (hasPlacementOpts(opts)) applyPlacement(el, placement);
      life.surfaces.set(el, Object.assign({ kind, placement }, rec || {}));
    }

    function canvasScale(rec) {
      const dpr = currentDpr();
      if (rec.cssMode) return rec.maxDpr ? Math.min(dpr, rec.maxDpr) : dpr;
      if (rec.maxDpr) return Math.min(dpr, rec.maxDpr);
      return 1;
    }
    function sizeCanvas2D(rec) {
      const s = canvasScale(rec);
      const w = Math.max(1, Math.round(H.env.width * s));
      const h = Math.max(1, Math.round(H.env.height * s));
      const c = rec.canvas;
      const changed = c.width !== w || c.height !== h || rec.scale !== s;
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      rec.scale = s;
      if (changed && rec.cssMode && rec.g) rec.rawSetTransform.call(rec.g, s, 0, 0, s, 0, 0);
    }
    function isIdentityTransformArgs(args) {
      if (args.length === 0) return true;
      if (args.length >= 6) return +args[0] === 1 && +args[1] === 0 && +args[2] === 0 && +args[3] === 1 && +args[4] === 0 && +args[5] === 0;
      const m = args[0];
      if (m && typeof m === "object") {
        const a = m.a ?? m.m11 ?? 1, b = m.b ?? m.m12 ?? 0, c = m.c ?? m.m21 ?? 0, d = m.d ?? m.m22 ?? 1, e = m.e ?? m.m41 ?? 0, f = m.f ?? m.m42 ?? 0;
        return a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0;
      }
      return false;
    }
    function installTransformRepair(rec) {
      const g = rec.g;
      rec.rawSetTransform = g.setTransform;
      g.setTransform = function () {
        if (isIdentityTransformArgs(arguments)) {
          warnOnce("css-identity", "coordinateSpace:\"css\" canvas: an identity setTransform()/resetTransform() was restored to CSS-pixel scale (the runtime keeps the DPR transform installed)");
          return rec.rawSetTransform.call(this, rec.scale, 0, 0, rec.scale, 0, 0);
        }
        return rec.rawSetTransform.apply(this, arguments);
      };
      if (typeof g.resetTransform === "function") {
        g.resetTransform = function () {
          warnOnce("css-identity", "coordinateSpace:\"css\" canvas: an identity setTransform()/resetTransform() was restored to CSS-pixel scale (the runtime keeps the DPR transform installed)");
          return rec.rawSetTransform.call(this, rec.scale, 0, 0, rec.scale, 0, 0);
        };
      }
    }
    function resizeSurfaces(life) {
      for (const rec of life.surfaces.values()) {
        if (rec.kind === "canvas2d") sizeCanvas2D(rec);
        else if (rec.kind === "canvas") {
          const c = rec.canvas;
          if (c.width === rec.hostW && c.height === rec.hostH) {
            rec.hostW = Math.max(1, Math.round(H.env.width * currentDpr()));
            rec.hostH = Math.max(1, Math.round(H.env.height * currentDpr()));
            c.width = rec.hostW;
            c.height = rec.hostH;
          }
        }
      }
      if (life.fxRoot) life.fxRoot._resize();
    }

    function resolveSurface(handle, what) {
      const h = handle;
      const isEl = (v) => v && typeof v === "object" && v.nodeType === 1;
      if (isEl(h)) return h;
      if (h && typeof h === "object") {
        const candidates = [h.current, h.ref && h.ref.current, h.canvas, h.element, h.domElement, h.domNode, h.view, h.renderer && h.renderer.domElement];
        for (const c of candidates) if (isEl(c)) return c;
        for (const m of ["getCanvas", "getRenderingCanvas"]) {
          if (typeof h[m] === "function") {
            const c = h[m]();
            if (isEl(c)) return c;
          }
        }
      }
      throw new TypeError((what || "ctx.surface") + ": expected an HTMLElement/HTMLCanvasElement or a wrapper handle ({ current }, { canvas }, { element }, { domElement }, { view }, { renderer: { domElement } }, { getCanvas() }), got " + safeJson(handle, 80));
    }
    function enableElement(life, el) {
      if (!el || !el.style) return;
      el.style.pointerEvents = "auto";
      const rec = life.surfaces.get(el);
      if (rec) rec.placement.input = "auto";
    }

    function makeSurfaceApi(life) {
      return {
        place(surface, opts) {
          assertAlive(life, "ctx.surface.place");
          const el = resolveSurface(surface, "ctx.surface.place");
          if (!container.contains(el) || el === container) throw new Error("ctx.surface.place: the surface must live inside ctx.container");
          let rec = life.surfaces.get(el);
          if (!rec) {
            rec = { kind: "external", placement: normPlacement(null, null) };
            life.surfaces.set(el, rec);
          }
          rec.placement = normPlacement(opts || {}, rec.placement);
          applyPlacement(el, rec.placement);
          return surface;
        },
        getPlacement(surface) {
          assertAlive(life, "ctx.surface.getPlacement");
          const el = resolveSurface(surface, "ctx.surface.getPlacement");
          const rec = life.surfaces.get(el);
          if (!rec) return null;
          const p = rec.placement;
          return { layer: p.layer, order: p.order, zIndex: p.zIndex, input: p.input, computedZIndex: computedZ(p) };
        },
        enableInput(surface) {
          assertAlive(life, "ctx.surface.enableInput");
          const el = resolveSurface(surface, "ctx.surface.enableInput");
          enableElement(life, el);
          return surface;
        }
      };
    }

    function createRoot(life, opts) {
      assertAlive(life, "ctx.createRoot");
      const o = opts || {};
      const el = doc.createElement("div");
      el.style.cssText = "position:absolute;left:0;top:0;right:0;bottom:0;";
      applyStyle(el, o.style);
      if (o.className) el.className = String(o.className);
      if (o.touchAction) el.style.touchAction = String(o.touchAction);
      registerSurface(life, el, "root", o, {});
      container.appendChild(el);
      return el;
    }
    function createCanvas2D(life, opts) {
      assertAlive(life, "ctx.createCanvas2D");
      const o = opts || {};
      const canvas = doc.createElement("canvas");
      canvas.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:block;";
      if (o.touchAction) canvas.style.touchAction = String(o.touchAction);
      const cssMode = o.coordinateSpace === "css" || o.scaleToCssPixels === true;
      const maxDpr = isNum(+o.maxDpr) && +o.maxDpr > 0 && o.maxDpr != null ? +o.maxDpr : null;
      const attrs = {};
      if (o.alpha === false) attrs.alpha = false;
      if (o.desynchronized === true) attrs.desynchronized = true;
      if (o.willReadFrequently === true) attrs.willReadFrequently = true;
      const g = canvas.getContext("2d", attrs);
      const rec = { canvas, g, cssMode, maxDpr, scale: 0, rawSetTransform: g ? g.setTransform : null };
      if (cssMode && g) installTransformRepair(rec);
      sizeCanvas2D(rec);
      registerSurface(life, canvas, "canvas2d", o, rec);
      container.appendChild(canvas);
      return canvas;
    }
    function createCanvas(life, opts) {
      assertAlive(life, "ctx.createCanvas");
      const o = opts || {};
      const canvas = doc.createElement("canvas");
      canvas.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:block;";
      if (o.touchAction) canvas.style.touchAction = String(o.touchAction);
      const rec = { canvas, hostW: Math.max(1, Math.round(H.env.width * currentDpr())), hostH: Math.max(1, Math.round(H.env.height * currentDpr())) };
      canvas.width = rec.hostW;
      canvas.height = rec.hostH;
      registerSurface(life, canvas, "canvas", o, rec);
      container.appendChild(canvas);
      return canvas;
    }

    // ---------------------------------------------------------------------------------------------
    // Events, frames, timers, cleanup
    // ---------------------------------------------------------------------------------------------
    const POINTERISH = /^(pointer|mouse|touch|click|dblclick|contextmenu|wheel)/i;
    function makeListen(life) {
      return function listen(target, eventName, handler, options) {
        if (!target || typeof target.addEventListener !== "function") throw new TypeError("ctx.listen(target, eventName, handler): target must be an EventTarget");
        if (typeof handler !== "function" && !(handler && typeof handler.handleEvent === "function")) throw new TypeError("ctx.listen: handler must be a function");
        if (isDead(life, "ctx.listen")) return function () {};
        const name = String(eventName);
        if ((target === doc.body || target === doc.documentElement) && POINTERISH.test(name)) warnOnce("body-listen", "ctx.listen on document.body/documentElement for \"" + name + "\": do not listen on the body for core interaction; use a surface");
        // Legacy auto-enablement for ordinary children (not managed surfaces) unless inline pointer-events is none.
        if (target.nodeType === 1 && target !== container && container.contains(target) && !life.surfaces.has(target) && POINTERISH.test(name) && target.style.pointerEvents !== "none") {
          target.style.pointerEvents = "auto";
        }
        target.addEventListener(name, handler, options);
        return own(life, () => target.removeEventListener(name, handler, options), "listener");
      };
    }

    function destroyLife(life, reason) {
      if (!life || life.destroyed) return;
      life.destroying = true;
      flushPrimary(life, "cleanup");
      const cbs = life.destroyCbs.slice().reverse();
      for (const fn of cbs) guardCall(fn, "ctx.onDestroy callback");
      const counts = {};
      for (const d of Array.from(life.owned).reverse()) {
        counts[d.kind] = (counts[d.kind] || 0) + 1;
        d();
      }
      const frames = life.frameCbs.length;
      life.frameCbs.length = 0;
      for (const loop of Array.from(life.loops)) loop.destroy();
      for (const a of Array.from(life.animations)) { try { a.cancel(); } catch (_) {} }
      life.animations.clear();
      if (life.transition) life.transition._kill();
      for (const a of Array.from(life.audioEls)) { try { a.pause(); a.removeAttribute("src"); } catch (_) {} }
      life.audioEls.clear();
      if (H.music) H.music.teardown("destroy");
      const pending = Array.from(life.pending);
      for (const p of pending) p.reject(hostError("runtime_destroyed", "The Bit runtime was destroyed before this request settled", { status: 0, retryable: false }));
      let surfaces = 0;
      for (const el of life.surfaces.keys()) { if (el.parentNode) { el.remove(); surfaces++; } }
      life.surfaces.clear();
      let stray = 0;
      while (container.firstChild) { container.firstChild.remove(); stray++; }
      container.style.transform = "";
      life.destroyed = true;
      if (H.life === life) {
        stopTicking();
        H.status = "destroyed";
        shell.status(statusSnapshot());
      }
      if (H.onboarding) H.onboarding.onDestroy();
      const parts = Object.keys(counts).map((k) => counts[k] + " " + k + (counts[k] === 1 ? "" : "s"));
      log("lifecycle", "destroy (" + reason + "): ran " + cbs.length + " onDestroy callback" + (cbs.length === 1 ? "" : "s") + " (reverse order), removed " + surfaces + " surface" + (surfaces === 1 ? "" : "s") + (stray ? " + " + stray + " stray node" + (stray === 1 ? "" : "s") : "") + ", " + frames + " frame callback" + (frames === 1 ? "" : "s") + (parts.length ? ", " + parts.join(", ") : "") + (pending.length ? ", rejected " + pending.length + " pending request" + (pending.length === 1 ? "" : "s") + " (runtime_destroyed)" : ""));
    }

    // ---------------------------------------------------------------------------------------------
    // Input: trackers, gestures, activate, delegate
    // ---------------------------------------------------------------------------------------------
    const TRACKER_DEFAULTS = { tapMaxMs: 250, tapMaxDistance: 12, doubleTapMaxMs: 280, holdMs: 500, swipeMinDistance: 36, swipeMinVelocity: 0.35, dragMinDistance: 8, multitouch: true };
    const GESTURES = ["down", "move", "up", "cancel", "tap", "doubleTap", "dragStart", "drag", "dragEnd", "hold", "holdStart", "holdEnd", "swipe", "pinch", "rotate"];
    const ZERO_VECTOR = Object.freeze({ x: 0, y: 0, angle: 0, distance: 0, velocity: 0, direction: null });

    function directionOf(x, y) {
      if (x === 0 && y === 0) return null;
      return Math.abs(x) >= Math.abs(y) ? (x > 0 ? "right" : "left") : (y > 0 ? "down" : "up");
    }
    function makeVector(x, y, velocity) {
      return { x, y, angle: Math.atan2(y, x), distance: Math.hypot(x, y), velocity: velocity || 0, direction: directionOf(x, y) };
    }
    function emptyPointer(id) {
      return { id: id === undefined ? null : id, isPrimary: false, pointerType: null, pressure: 0, width: 0, height: 0, x: 0, y: 0, dx: 0, dy: 0, startX: 0, startY: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, screenX: 0, screenY: 0, normalizedX: 0, normalizedY: 0, ndcX: 0, ndcY: 0, down: false, pressed: false, released: false, cancelled: false, tap: false, doubleTap: false, dragging: false, durationMs: 0, distance: 0, velocityX: 0, velocityY: 0, vector: ZERO_VECTOR, swipe: null };
    }
    function resolveInputTarget(target, what) {
      if (target && (target === win || target === doc)) return target === win ? doc.documentElement : doc.documentElement;
      return resolveSurface(target, what);
    }

    function createTracker(life, target, options, mode) {
      const el = resolveInputTarget(target, mode.what);
      const opts = options || {};
      const o = Object.assign({}, TRACKER_DEFAULTS);
      for (const k of Object.keys(TRACKER_DEFAULTS)) if (opts[k] !== undefined && opts[k] !== null) o[k] = typeof TRACKER_DEFAULTS[k] === "number" ? Number(opts[k]) : !!opts[k];
      const isCanvas = el.tagName === "CANVAS";
      const preventDefault = hasOwn(opts, "preventDefault") ? !!opts.preventDefault : isCanvas;
      const capture = opts.pointerCapture === undefined || opts.pointerCapture === "auto" ? isCanvas : !!opts.pointerCapture;
      const touchAction = opts.touchAction != null ? String(opts.touchAction) : (isCanvas ? "none" : null);
      const passive = hasOwn(opts, "passive") ? !!opts.passive : !preventDefault;
      if (touchAction != null) el.style.touchAction = touchAction;
      if (mode.enable) enableElement(life, el);

      const pointers = new Map();
      const subs = new Map();
      let primaryId = null;
      let lastPrimary = emptyPointer();
      let lastTap = null;
      let destroyed = false;
      const frame = { pressed: false, released: false, tap: false, doubleTap: false, swipe: null, dx: 0, dy: 0 };
      const pinch = { active: false, scale: 1, delta: 0, centerX: 0, centerY: 0, distance: 0, startDistance: 0, pointers: 0 };
      const rotate = { active: false, angle: 0, delta: 0, centerX: 0, centerY: 0, pointers: 0 };
      let twoStart = null;

      function local(e) {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const nx = r.width ? x / r.width : 0;
        const ny = r.height ? y / r.height : 0;
        return { x, y, nx, ny };
      }
      function snapshot(p) {
        if (!p) return emptyPointer();
        const s = {};
        for (const k of Object.keys(p)) if (k[0] !== "_") s[k] = p[k];
        if (p.down) s.durationMs = now() - p._t0;
        s.target = mode.eventTarget ? p._downTarget : el;
        return s;
      }
      function emit(name, p, extra) {
        const set = subs.get(name);
        if (!set || !set.size) return;
        const payload = p ? snapshot(p) : {};
        if (extra) Object.assign(payload, extra);
        for (const h of Array.from(set)) guardCall(h, "ctx.input \"" + name + "\" handler", [payload]);
      }
      function velocityOf(p) {
        const s = p._samples;
        if (s.length < 2) return { vx: 0, vy: 0 };
        const a = s[0], b = s[s.length - 1];
        const dt = Math.max(1, b.t - a.t);
        return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
      }
      function writePosition(p, e) {
        const l = local(e);
        p.dx = l.x - p.x;
        p.dy = l.y - p.y;
        p.x = l.x;
        p.y = l.y;
        p.clientX = e.clientX; p.clientY = e.clientY;
        p.pageX = e.pageX; p.pageY = e.pageY;
        p.screenX = e.screenX; p.screenY = e.screenY;
        p.normalizedX = l.nx; p.normalizedY = l.ny;
        p.ndcX = l.nx * 2 - 1; p.ndcY = 1 - l.ny * 2;
        p.pressure = e.pressure || 0;
        p.width = e.width || 0; p.height = e.height || 0;
        const t = now();
        p._samples.push({ t, x: p.x, y: p.y });
        while (p._samples.length > 2 && t - p._samples[0].t > 100) p._samples.shift();
        p.distance = Math.hypot(p.x - p.startX, p.y - p.startY);
        p.durationMs = t - p._t0;
        const v = velocityOf(p);
        p.velocityX = v.vx; p.velocityY = v.vy;
        p.vector = makeVector(p.x - p.startX, p.y - p.startY, Math.hypot(v.vx, v.vy));
      }
      function updateTwoFinger() {
        const act = Array.from(pointers.values()).filter((p) => p.down);
        if (act.length >= 2) {
          const a = act[0], b = act[1];
          const dist = Math.hypot(b.x - a.x, b.y - a.y);
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
          if (!twoStart) {
            twoStart = { dist: dist || 1, ang };
            Object.assign(pinch, { active: true, scale: 1, delta: 0, startDistance: dist, distance: dist, centerX: cx, centerY: cy, pointers: act.length });
            Object.assign(rotate, { active: true, angle: 0, delta: 0, centerX: cx, centerY: cy, pointers: act.length });
            return;
          }
          const scale = dist / twoStart.dist;
          let angle = ang - twoStart.ang;
          while (angle > Math.PI) angle -= Math.PI * 2;
          while (angle < -Math.PI) angle += Math.PI * 2;
          Object.assign(pinch, { active: true, delta: scale - pinch.scale, scale, distance: dist, centerX: cx, centerY: cy, pointers: act.length });
          Object.assign(rotate, { active: true, delta: angle - rotate.angle, angle, centerX: cx, centerY: cy, pointers: act.length });
          emit("pinch", act[0], { pinch: Object.assign({}, pinch), active: true, scale: pinch.scale, delta: pinch.delta, centerX: cx, centerY: cy, distance: dist, startDistance: pinch.startDistance, pointers: act.length });
          emit("rotate", act[0], { rotate: Object.assign({}, rotate), active: true, angle: rotate.angle, delta: rotate.delta, centerX: cx, centerY: cy, pointers: act.length });
        } else if (twoStart) {
          twoStart = null;
          pinch.active = false; rotate.active = false; pinch.delta = 0; rotate.delta = 0;
        }
      }
      function startHold(p) {
        p._holdTimer = _setTimeout(() => {
          p._holdTimer = 0;
          if (destroyed || !p.down || p.dragging || p.distance > o.tapMaxDistance) return;
          p._held = true;
          p.durationMs = now() - p._t0;
          emit("holdStart", p);
          emit("hold", p);
        }, o.holdMs);
      }
      function onDown(e) {
        if (destroyed) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (!o.multitouch && pointers.size > 0) return;
        if (preventDefault && e.cancelable) e.preventDefault();
        if (capture) { try { el.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointers have no capture */ } }
        const l = local(e);
        const t = now();
        const p = Object.assign(emptyPointer(e.pointerId), {
          isPrimary: !!e.isPrimary, pointerType: e.pointerType || "mouse", pressure: e.pressure || 0, width: e.width || 0, height: e.height || 0,
          x: l.x, y: l.y, startX: l.x, startY: l.y, clientX: e.clientX, clientY: e.clientY, pageX: e.pageX, pageY: e.pageY, screenX: e.screenX, screenY: e.screenY,
          normalizedX: l.nx, normalizedY: l.ny, ndcX: l.nx * 2 - 1, ndcY: 1 - l.ny * 2, down: true, pressed: true,
          _t0: t, _samples: [{ t, x: l.x, y: l.y }], _held: false, _holdTimer: 0, _downTarget: e.target
        });
        pointers.set(e.pointerId, p);
        if (primaryId === null) primaryId = e.pointerId;
        if (primaryId === e.pointerId) { frame.pressed = true; lastPrimary = p; }
        startHold(p);
        emit("down", p);
        updateTwoFinger();
      }
      function onMove(e) {
        const p = pointers.get(e.pointerId);
        if (!p || destroyed) return;
        writePosition(p, e);
        if (primaryId === e.pointerId) { frame.dx += p.dx; frame.dy += p.dy; }
        let started = false;
        if (!p.dragging && p.distance >= o.dragMinDistance) {
          p.dragging = true;
          started = true;
          if (p._holdTimer) { _clearTimeout(p._holdTimer); p._holdTimer = 0; }
        }
        emit("move", p);
        if (started) emit("dragStart", p);
        if (p.dragging) emit("drag", p);
        updateTwoFinger();
      }
      function finish(e, cancelled) {
        const p = pointers.get(e.pointerId);
        if (!p || destroyed) return;
        if (!cancelled && e.clientX !== undefined) writePosition(p, e);
        if (p._holdTimer) { _clearTimeout(p._holdTimer); p._holdTimer = 0; }
        const t = now();
        p.down = false;
        p.released = true;
        p.cancelled = !!cancelled;
        p.durationMs = t - p._t0;
        if (!cancelled) {
          if (!p.dragging && !p._held && p.durationMs <= o.tapMaxMs && p.distance <= o.tapMaxDistance) {
            p.tap = true;
            if (lastTap && t - lastTap.t <= o.doubleTapMaxMs && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) <= o.tapMaxDistance * 2) {
              p.doubleTap = true;
              lastTap = null;
            } else {
              lastTap = { t, x: p.x, y: p.y };
            }
          }
          const speed = Math.hypot(p.velocityX, p.velocityY);
          if (p.distance >= o.swipeMinDistance && speed >= o.swipeMinVelocity) p.swipe = makeVector(p.x - p.startX, p.y - p.startY, speed);
        }
        if (primaryId === e.pointerId) {
          frame.released = true;
          if (p.tap) frame.tap = true;
          if (p.doubleTap) frame.doubleTap = true;
          if (p.swipe) frame.swipe = p.swipe;
          lastPrimary = p;
        }
        emit(cancelled ? "cancel" : "up", p);
        if (p.dragging) emit("dragEnd", p);
        if (p._held) emit("holdEnd", p);
        if (p.tap) emit("tap", p);
        if (p.doubleTap) emit("doubleTap", p);
        if (p.swipe) emit("swipe", p);
        pointers.delete(e.pointerId);
        if (primaryId === e.pointerId) {
          primaryId = null;
          for (const [id, q] of pointers) { if (q.down) { primaryId = id; break; } }
        }
        updateTwoFinger();
      }
      const onUp = (e) => finish(e, false);
      const onCancel = (e) => finish(e, true);
      el.addEventListener("pointerdown", onDown, { passive });
      win.addEventListener("pointermove", onMove, true);
      win.addEventListener("pointerup", onUp, true);
      win.addEventListener("pointercancel", onCancel, true);

      function cur() {
        if (primaryId !== null && pointers.has(primaryId)) return pointers.get(primaryId);
        return lastPrimary;
      }
      const api = {
        get x() { return cur().x; },
        get y() { return cur().y; },
        get dx() { return frame.dx; },
        get dy() { return frame.dy; },
        get startX() { return cur().startX; },
        get startY() { return cur().startY; },
        get down() { return primaryId !== null && pointers.has(primaryId) && pointers.get(primaryId).down; },
        get pressed() { return frame.pressed; },
        get released() { return frame.released; },
        get tap() { return frame.tap; },
        get doubleTap() { return frame.doubleTap; },
        get swipe() { return frame.swipe; },
        get dragging() { return !!cur().dragging && !!cur().down; },
        get durationMs() { const p = cur(); return p.down ? now() - p._t0 : p.durationMs; },
        get distance() { return cur().distance; },
        get velocityX() { return cur().velocityX; },
        get velocityY() { return cur().velocityY; },
        get vector() { return cur().vector; },
        get primary() { return snapshot(cur()); },
        get pointers() { return Array.from(pointers.values()).map(snapshot); },
        get pinch() { return Object.assign({}, pinch); },
        get rotate() { return Object.assign({}, rotate); },
        hold(ms) {
          const p = primaryId !== null ? pointers.get(primaryId) : null;
          const need = isNum(ms) ? ms : o.holdMs;
          return !!p && p.down && !p.dragging && now() - p._t0 >= need;
        },
        on(name, handler) {
          if (GESTURES.indexOf(name) < 0) throw new TypeError("input.on: unknown gesture \"" + name + "\" (use " + GESTURES.join(", ") + ")");
          if (typeof handler !== "function") throw new TypeError("input.on: handler must be a function");
          if (!subs.has(name)) subs.set(name, new Set());
          subs.get(name).add(handler);
          return function () { const s = subs.get(name); if (s) s.delete(handler); };
        },
        pointer(id) {
          const p = pointers.get(id);
          return p ? snapshot(p) : emptyPointer(id);
        },
        zone(zones) { return zoneMatch(api, zones, false); },
        frameDone() {
          frame.pressed = false; frame.released = false; frame.tap = false; frame.doubleTap = false; frame.swipe = null; frame.dx = 0; frame.dy = 0;
        },
        destroy() {
          if (destroyed) return;
          destroyed = true;
          el.removeEventListener("pointerdown", onDown, { passive });
          win.removeEventListener("pointermove", onMove, true);
          win.removeEventListener("pointerup", onUp, true);
          win.removeEventListener("pointercancel", onCancel, true);
          for (const p of pointers.values()) if (p._holdTimer) _clearTimeout(p._holdTimer);
          pointers.clear();
          subs.clear();
          life.trackers.delete(api);
        },
        _cancelAll() {
          for (const id of Array.from(pointers.keys())) finish({ pointerId: id }, true);
        }
      };
      life.trackers.add(api);
      api._dispose = own(life, () => api.destroy(), "tracker");
      return api;
    }

    function pointOf(v) {
      if (!v) return null;
      if (isNum(v.x) && isNum(v.y)) return { x: v.x, y: v.y, pointer: v };
      return null;
    }
    function zoneHit(z, pt) {
      if (!z) return false;
      if (Array.isArray(z.points)) return polygonContains(z.points, pt);
      if (isNum(z.cx) && isNum(z.cy) && isNum(z.r)) return Math.hypot(pt.x - z.cx, pt.y - z.cy) <= z.r;
      if (isNum(z.x) && isNum(z.y) && isNum(z.w) && isNum(z.h)) return pt.x >= z.x && pt.x <= z.x + z.w && pt.y >= z.y && pt.y <= z.y + z.h;
      return false;
    }
    function zoneMatch(source, zones, all) {
      const pt = pointOf(source);
      const out = [];
      if (!pt || !zones) return all ? out : null;
      const list = Array.isArray(zones) ? zones.map((z, i) => [z && z.id != null ? z.id : i, z]) : Object.keys(zones).map((k) => [zones[k] && zones[k].id != null ? zones[k].id : k, zones[k]]);
      for (const [id, z] of list) {
        if (zoneHit(z, pt)) {
          const m = { id, zone: z, x: pt.x, y: pt.y, pointer: source.primary ? source.primary : source };
          if (!all) return m;
          out.push(m);
        }
      }
      return all ? out : null;
    }
    function polygonContains(points, pt) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j];
        const ax = Array.isArray(a) ? a[0] : a.x, ay = Array.isArray(a) ? a[1] : a.y;
        const bx = Array.isArray(b) ? b[0] : b.x, by = Array.isArray(b) ? b[1] : b.y;
        if ((ay > pt.y) !== (by > pt.y) && pt.x < ((bx - ax) * (pt.y - ay)) / (by - ay) + ax) inside = !inside;
      }
      return inside;
    }

    function makeInput(life) {
      const api = {
        track(target, options) {
          assertAlive(life, "ctx.input.track");
          return guard(createTracker(life, target, options, { enable: true, what: "ctx.input.track" }), "input.track(...)", "tracker");
        },
        on(target, gesture, handler, options) {
          if (GESTURES.indexOf(gesture) < 0) throw new TypeError("ctx.input.on: unknown gesture \"" + gesture + "\" (use " + GESTURES.join(", ") + ")");
          if (typeof handler !== "function") throw new TypeError("ctx.input.on: handler must be a function");
          if (isDead(life, "ctx.input.on")) return function () {};
          const tr = createTracker(life, target, options, { enable: true, what: "ctx.input.on" });
          tr.on(gesture, handler);
          return tr._dispose;
        },
        activate(target, handler, options) {
          const el = resolveSurface(target, "ctx.input.activate");
          if (typeof handler !== "function") throw new TypeError("ctx.input.activate: handler must be a function");
          if (isDead(life, "ctx.input.activate")) return function () {};
          enableElement(life, el);
          const nativeKeys = el.matches("button, input, select, textarea, summary, a[href]");
          const onClick = (e) => guardCall(handler, "ctx.input.activate handler", [e]);
          const onKey = (e) => {
            if (e.repeat) return;
            if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
              e.preventDefault();
              guardCall(handler, "ctx.input.activate handler", [e]);
            }
          };
          el.addEventListener("click", onClick, options);
          if (!nativeKeys) el.addEventListener("keydown", onKey);
          return own(life, () => {
            el.removeEventListener("click", onClick, options);
            if (!nativeKeys) el.removeEventListener("keydown", onKey);
          }, "listener");
        },
        delegate(root, selector, gestureOrEvent, handler, options) {
          const el = resolveSurface(root, "ctx.input.delegate");
          if (typeof selector !== "string" || !selector) throw new TypeError("ctx.input.delegate: selector must be a CSS selector string");
          if (typeof handler !== "function") throw new TypeError("ctx.input.delegate: handler must be a function");
          if (isDead(life, "ctx.input.delegate")) return function () {};
          const match = (t) => {
            const start = t && t.nodeType === 1 ? t : t && t.parentElement;
            const d = start && start.closest ? start.closest(selector) : null;
            return d && el.contains(d) ? d : null;
          };
          if (GESTURES.indexOf(gestureOrEvent) >= 0) {
            const tr = createTracker(life, el, options, { enable: false, eventTarget: true, what: "ctx.input.delegate" });
            tr.on(gestureOrEvent, (payload) => {
              const d = match(payload.target);
              if (d) { payload.delegateTarget = d; handler(payload); }
            });
            return tr._dispose;
          }
          const fn = (event) => {
            const d = match(event.target);
            if (d) guardCall(handler, "ctx.input.delegate handler", [{ event, target: event.target, delegateTarget: d }]);
          };
          el.addEventListener(String(gestureOrEvent), fn, options);
          return own(life, () => el.removeEventListener(String(gestureOrEvent), fn, options), "listener");
        },
        zone(inputOrPointer, zones) { return zoneMatch(inputOrPointer, zones, false); },
        zones(inputOrPointer, zones) { return zoneMatch(inputOrPointer, zones, true); },
        hitCircle(inputOrPointer, x, y, r) { const p = pointOf(inputOrPointer); return !!p && Math.hypot(p.x - x, p.y - y) <= r; },
        hitRect(inputOrPointer, x, y, w, h) { const p = pointOf(inputOrPointer); return !!p && p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h; },
        hitPolygon(inputOrPointer, points) { const p = pointOf(inputOrPointer); return !!p && Array.isArray(points) && polygonContains(points, p); },
        nearest(inputOrPointer, points) {
          const p = pointOf(inputOrPointer);
          if (!p || !Array.isArray(points) || !points.length) return null;
          let best = null;
          for (const c of points) {
            const cx = Array.isArray(c) ? c[0] : c.x, cy = Array.isArray(c) ? c[1] : c.y;
            const d = Math.hypot(cx - p.x, cy - p.y);
            if (!best || d < best.distance) best = Object.assign({}, Array.isArray(c) ? {} : c, { x: cx, y: cy, distance: d });
          }
          return best;
        }
      };
      return api;
    }

    // ---------------------------------------------------------------------------------------------
    // ctx.game: loop, timing helpers, score tracks, progress
    // ---------------------------------------------------------------------------------------------
    function makeLoop(life, options) {
      assertAlive(life, "ctx.game.loop");
      const o = options || {};
      const state = o.state !== undefined ? o.state : {};
      const hasFixed = typeof o.fixedUpdate === "function";
      let fpsCap = o.fps == null || o.fps === "display" ? null : (Number(o.fps) > 0 ? Number(o.fps) : null);
      const maxDeltaMs = isNum(+o.maxDeltaMs) && +o.maxDeltaMs > 0 && o.maxDeltaMs != null ? +o.maxDeltaMs : 80;
      const maxSubsteps = isNum(+o.maxSubsteps) && +o.maxSubsteps >= 1 && o.maxSubsteps != null ? Math.floor(+o.maxSubsteps) : 4;
      let timeScale = isNum(+o.timeScale) && o.timeScale != null ? +o.timeScale : 1;
      const fixedHz = o.fixedHz === null || o.fixedHz === false ? null : (Number(o.fixedHz) > 0 ? Number(o.fixedHz) : (hasFixed ? 60 : null));
      const autoFrameDone = o.autoFrameDone !== false;
      const resetOnResume = o.resetOnResume !== false;
      const input = o.input || null;
      let running = false, paused = false, destroyed = false, hostPaused = false;
      let last = 0, acc = 0, frame = 0, elapsed = 0;
      const stats = { fps: 0, frameMs: 0, updateMs: 0, renderMs: 0, droppedFrames: 0, clampedDeltas: 0, substeps: 0 };

      function fail(err, phase) {
        if (typeof o.onError === "function") {
          try { o.onError(err, phase); } catch (e2) { reportError(e2, "game.loop onError"); }
        } else {
          // sdk.md: without onError, callback failures are rethrown asynchronously.
          _setTimeout(() => { throw err; }, 0);
        }
      }
      function call(phase, fn, args) {
        if (typeof fn !== "function") return;
        try { fn.apply(undefined, args); } catch (e) { fail(e, phase); }
      }
      function runFrame(dtRaw) {
        let dt = dtRaw;
        if (dt > maxDeltaMs) { dt = maxDeltaMs; stats.clampedDeltas++; }
        const sdt = dt * timeScale;
        stats.frameMs = dtRaw;
        const t0 = now();
        call("update", o.update, [sdt, state]);
        let sub = 0;
        let alpha = 0;
        if (fixedHz && hasFixed) {
          const step = 1000 / fixedHz;
          acc += sdt;
          while (acc >= step && sub < maxSubsteps) {
            call("fixedUpdate", o.fixedUpdate, [step, state]);
            acc -= step;
            sub++;
          }
          if (acc >= step) acc = acc % step; // excess backlog is dropped
          alpha = Math.min(0.999999, acc / step);
        }
        stats.substeps = sub;
        const t1 = now();
        stats.updateMs = t1 - t0;
        call("render", o.render, [alpha, state]);
        stats.renderMs = now() - t1;
        frame++;
        elapsed += sdt;
        if (input && autoFrameDone && typeof input.frameDone === "function") input.frameDone();
      }
      function resetClock() { last = 0; acc = 0; }
      const loop = {
        get frame() { return frame; },
        get elapsedMs() { return elapsed; },
        get timeScale() { return timeScale; },
        get isRunning() { return running; },
        get isPaused() { return paused; },
        get stats() { return Object.assign({}, stats); },
        start() {
          if (destroyed || (running && !paused)) return;
          running = true; paused = false; resetClock();
          call("onStart", o.onStart, [state]);
        },
        pause() {
          if (destroyed || !running || paused) return;
          paused = true;
          call("onPause", o.onPause, [state]);
        },
        resume() {
          if (destroyed || !running || !paused) return;
          paused = false;
          if (resetOnResume) resetClock();
          call("onResume", o.onResume, [state]);
        },
        stop() {
          if (destroyed || !running) return;
          running = false; paused = false;
          call("onStop", o.onStop, [state]);
        },
        destroy() {
          if (destroyed) return;
          running = false;
          destroyed = true;
          life.loops.delete(loop);
          call("onDestroy", o.onDestroy, [state]);
        },
        step(ms) {
          if (destroyed) return;
          runFrame(isNum(ms) ? ms : 1000 / 60);
        },
        resetClock,
        setFps(v) { fpsCap = v == null || v === "display" ? null : (Number(v) > 0 ? Number(v) : null); },
        setTimeScale(v) { const n = Number(v); if (Number.isFinite(n) && n >= 0) timeScale = n; },
        _tick(t) {
          if (!running || paused || destroyed || hostPaused) return;
          if (!last) { last = t; runFrame(0); return; }
          const dtRaw = t - last;
          if (fpsCap && dtRaw < 1000 / fpsCap - 1) return;
          last = t;
          stats.fps = stats.fps ? stats.fps * 0.9 + (1000 / Math.max(1, dtRaw)) * 0.1 : 1000 / Math.max(1, dtRaw);
          if (!fpsCap && dtRaw > 34) stats.droppedFrames += Math.max(0, Math.round(dtRaw / (1000 / 60)) - 1);
          runFrame(dtRaw);
        },
        _hostPause() {
          if (hostPaused) return;
          hostPaused = true;
          if (running && !paused) call("onPause", o.onPause, [state]);
        },
        _hostResume() {
          if (!hostPaused) return;
          hostPaused = false;
          if (running && !paused) {
            if (resetOnResume) resetClock();
            call("onResume", o.onResume, [state]);
          }
        }
      };
      life.loops.add(loop);
      own(life, () => loop.destroy(), "loop");
      if (o.autoStart !== false) loop.start();
      ensureTicking();
      return guard(loop, "game.loop(...)", "loop");
    }

    function makeTimer(ms, opts) {
      const o = opts || {};
      let duration = Math.max(0, Number(ms) || 0);
      let elapsed = clamp(Number(o.elapsedMs) || 0, 0, duration || Infinity);
      const repeat = !!o.repeat;
      let wrapped = false;
      return {
        update(dtMs) {
          const d = Math.max(0, Number(dtMs) || 0);
          wrapped = false;
          if (repeat && duration > 0) {
            const next = elapsed + d;
            wrapped = next >= duration;
            elapsed = next % duration;
          } else {
            elapsed = Math.min(duration, elapsed + d);
          }
          return repeat ? wrapped : elapsed >= duration;
        },
        reset(nextMs) { if (isNum(nextMs)) duration = Math.max(0, nextMs); elapsed = 0; wrapped = false; },
        get durationMs() { return duration; },
        get elapsedMs() { return elapsed; },
        get remainingMs() { return Math.max(0, duration - elapsed); },
        get progress() { return duration > 0 ? clamp(elapsed / duration, 0, 1) : 1; },
        get done() { return repeat ? wrapped : elapsed >= duration; }
      };
    }
    function makeCooldown(ms, opts) {
      const o = opts || {};
      let duration = Math.max(0, Number(ms) || 0);
      let remaining = isNum(o.remainingMs) ? clamp(o.remainingMs, 0, Infinity) : 0;
      return {
        update(dtMs) { remaining = Math.max(0, remaining - Math.max(0, Number(dtMs) || 0)); return remaining === 0; },
        ready() { return remaining <= 0; },
        trigger(nextMs) { if (isNum(nextMs)) duration = Math.max(0, nextMs); remaining = duration; return true; },
        reset() { remaining = 0; },
        get durationMs() { return duration; },
        get remainingMs() { return remaining; },
        get progress() { return duration > 0 ? clamp(1 - remaining / duration, 0, 1) : 1; }
      };
    }
    function makeEvery(ms, fn, opts) {
      const interval = Math.max(1, Number(ms) || 1);
      const maxCalls = Math.max(1, Math.floor(Number(opts && opts.maxCallsPerUpdate) || 8));
      let elapsed = 0;
      let active = true;
      return {
        update(dtMs) {
          if (!active) return 0;
          elapsed += Math.max(0, Number(dtMs) || 0);
          let count = 0;
          while (elapsed >= interval && count < maxCalls) {
            elapsed -= interval;
            count++;
            guardCall(fn, "ctx.game.every callback", [{ count, intervalMs: interval, overflowMs: elapsed }]);
          }
          if (elapsed >= interval) elapsed = elapsed % interval;
          return count;
        },
        reset() { elapsed = 0; },
        destroy() { active = false; },
        get active() { return active; },
        get elapsedMs() { return elapsed; },
        get progress() { return clamp(elapsed / interval, 0, 1); }
      };
    }
    function makeSequence(steps, opts) {
      const list = Array.isArray(steps) ? steps : [];
      const context = opts && opts.context !== undefined ? opts.context : {};
      let index = 0, elapsed = 0, entered = false, done = list.length === 0;
      const info = () => ({ index, step: list[index] });
      return {
        update(dtMs) {
          if (done) return true;
          const step = list[index];
          if (!entered) { entered = true; if (typeof step.enter === "function") guardCall(step.enter, "sequence enter", [context, info()]); }
          elapsed += Math.max(0, Number(dtMs) || 0);
          const dur = Math.max(0, Number(step.durationMs) || 0);
          if (typeof step.update === "function") guardCall(step.update, "sequence update", [Math.min(elapsed, dur), context, Object.assign(info(), { progress: dur ? clamp(elapsed / dur, 0, 1) : 1 })]);
          if (elapsed >= dur) {
            if (typeof step.exit === "function") guardCall(step.exit, "sequence exit", [context, info()]);
            index++;
            elapsed = 0;
            entered = false;
            if (index >= list.length) { done = true; index = list.length - 1; }
          }
          return done;
        },
        reset() { index = 0; elapsed = 0; entered = false; done = list.length === 0; },
        get index() { return index; },
        get done() { return done; },
        get elapsedMs() { return elapsed; },
        get progress() { return list.length ? clamp((index + (done ? 1 : 0)) / list.length, 0, 1) : 1; },
        get context() { return context; }
      };
    }
    function makeStateMachine(def) {
      const d = def || {};
      const states = d.states || {};
      const context = d.context !== undefined ? d.context : {};
      let value = d.initial !== undefined ? d.initial : Object.keys(states)[0];
      const enter = (name, transition) => { const s = states[name]; if (s && typeof s.enter === "function") guardCall(s.enter, "stateMachine enter", [context, transition]); };
      enter(value, { from: null, to: value, event: null, payload: undefined });
      const m = {
        send(event, payload) {
          const s = states[value];
          if (!s || !s.on || !hasOwn(s.on, event)) return false;
          let spec = s.on[event];
          let target = null;
          if (typeof spec === "function") {
            const r = guardCall(spec, "stateMachine handler", [context, payload]);
            target = typeof r === "string" ? r : null;
          } else if (typeof spec === "string") {
            target = spec;
          } else if (spec && typeof spec === "object") {
            if (typeof spec.guard === "function" && !guardCall(spec.guard, "stateMachine guard", [context, payload])) return false;
            if (typeof spec.action === "function") guardCall(spec.action, "stateMachine action", [context, payload]);
            target = spec.target || null;
          }
          if (!target || !hasOwn(states, target)) return false;
          const transition = { from: value, to: target, event, payload };
          if (typeof s.exit === "function") guardCall(s.exit, "stateMachine exit", [context, transition]);
          value = target;
          enter(target, transition);
          return true;
        },
        is(name) { return value === name; },
        update(dtMs) { const s = states[value]; if (s && typeof s.update === "function") guardCall(s.update, "stateMachine update", [dtMs, context]); },
        render(alpha) { const s = states[value]; if (s && typeof s.render === "function") guardCall(s.render, "stateMachine render", [alpha, context]); },
        get value() { return value; },
        get context() { return context; },
        get states() { return states; }
      };
      return m;
    }
    function makeBounds(shape) {
      const s = shape || {};
      if (isNum(s.cx) && isNum(s.cy) && isNum(s.r ?? s.radius)) {
        const r = s.r ?? s.radius;
        return { contains: (p) => !!p && Math.hypot(p.x - s.cx, p.y - s.cy) <= r, clampPoint: (p) => p };
      }
      const x = s.x || 0, y = s.y || 0, w = s.w ?? s.width ?? 0, h = s.h ?? s.height ?? 0;
      return {
        contains: (p) => !!p && p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h,
        clampPoint: (p) => ({ x: clamp(p.x, x, x + w), y: clamp(p.y, y, y + h) })
      };
    }

    // ---- records store (fake boards persisted in localStorage) ----
    const FAKE_PLAYERS = [
      { userId: "usr_fake_quokka", username: "quokka", followed: true },
      { userId: "usr_fake_nova", username: "nova_k", followed: false },
      { userId: "usr_fake_ember", username: "ember", followed: true },
      { userId: "usr_fake_pine", username: "pixelpine", followed: false },
      { userId: "usr_fake_moth", username: "mothlight", followed: false },
      { userId: "usr_fake_rook", username: "rook.e", followed: false }
    ];
    function storageKey(part) { return STORAGE_PREFIX + H.bitKey + ":" + part; }
    function readJson(key, fallback) {
      try { const raw = win.localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; }
    }
    function writeJson(key, value) {
      try { win.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { log("warn", "harness storage write failed: " + e.message); }
    }
    function recordDecl(channel, api) {
      const recs = (H.manifest.memory && H.manifest.memory.records) || {};
      if (typeof channel !== "string" || !hasOwn(recs, channel)) {
        const msg = api + ": record channel \"" + channel + "\" is not declared in manifest.memory.records (declared: " + (Object.keys(recs).join(", ") || "none") + ")";
        log("error", msg);
        const e = new Error(msg);
        e.code = "undeclared_channel";
        throw e;
      }
      return recs[channel];
    }
    function dimValues(spec) {
      if (Array.isArray(spec)) return spec;
      if (spec && Array.isArray(spec.values)) return spec.values;
      return [];
    }
    function checkDims(decl, dims) {
      const declared = decl.dimensions || {};
      const names = Object.keys(declared);
      const given = dims && typeof dims === "object" ? dims : {};
      for (const k of Object.keys(given)) {
        if (names.indexOf(k) < 0) return { error: "unknown dimension \"" + k + "\" (declared: " + (names.join(", ") || "none") + ")" };
        if (dimValues(declared[k]).indexOf(given[k]) < 0) return { error: "dimension " + k + "=\"" + given[k] + "\" is not declared (one of " + dimValues(declared[k]).join(", ") + ")" };
      }
      for (const k of names) if (!hasOwn(given, k)) return { error: "missing dimension \"" + k + "\" (one of " + dimValues(declared[k]).join(", ") + ")" };
      const canon = {};
      for (const k of names.slice().sort()) canon[k] = given[k];
      return { dims: canon };
    }
    function boardId(channel, dims) {
      const parts = Object.keys(dims).map((k) => k + "=" + dims[k]);
      return channel + (parts.length ? "|" + parts.join(",") : "");
    }
    function formatValue(decl, v) {
      if (!isNum(v)) return String(v);
      switch (decl.format) {
        case "decimal": return v.toFixed(2);
        case "percent": return Math.round((Math.abs(v) <= 1 ? v * 100 : v)) + "%";
        case "timer": {
          const ms = decl.valueType === "duration_ms" ? v : v * 1000;
          const m = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
          return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
        }
        case "compact": return Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + "K" : String(Math.round(v));
        default: return String(Math.round(v));
      }
    }
    function loadBoards() { return readJson(storageKey("boards"), {}); }
    function getBoard(channel, decl, dims) {
      const boards = loadBoards();
      const id = boardId(channel, dims);
      if (!boards[id]) {
        const rnd = mulberry32(hashString(id));
        const asc = decl.order === "asc";
        const entries = FAKE_PLAYERS.map((p, i) => {
          let value;
          if (!asc) value = 1 + Math.floor(rnd() * 12);
          else if (decl.valueType === "duration_ms") value = Math.round(20000 + rnd() * 70000);
          else value = Math.round(10 + rnd() * 110);
          return { userId: p.userId, username: p.username, followed: p.followed, value, achievedAt: new Date(Date.now() - (i + 1) * 3600e3 * (2 + rnd() * 30)).toISOString() };
        });
        boards[id] = { entries };
        writeJson(storageKey("boards"), boards);
      }
      return { id, board: boards[id], boards };
    }
    function better(decl, a, b) { return decl.order === "asc" ? a < b : a > b; }
    function applyRecord(channel, decl, dims, value) {
      const { id, board, boards } = getBoard(channel, decl, dims);
      const dedupe = decl.dedupe || "best_per_user";
      const mine = board.entries.filter((e) => e.userId === VIEWER_ID);
      const prevBest = mine.reduce((best, e) => (best === null || better(decl, e.value, best) ? e.value : best), null);
      const improved = prevBest === null || better(decl, value, prevBest);
      const entry = { userId: VIEWER_ID, username: "tester", followed: true, value, achievedAt: new Date().toISOString() };
      if (dedupe === "all_entries") board.entries.push(entry);
      else if (dedupe === "latest_per_user") { board.entries = board.entries.filter((e) => e.userId !== VIEWER_ID); board.entries.push(entry); }
      else if (improved) { board.entries = board.entries.filter((e) => e.userId !== VIEWER_ID); board.entries.push(entry); }
      boards[id] = board;
      writeJson(storageKey("boards"), boards);
      return { improved, prevBest };
    }
    function rankRows(decl, entries) {
      const dedupe = decl.dedupe || "best_per_user";
      let list = entries.slice();
      if (dedupe !== "all_entries") {
        const byUser = new Map();
        for (const e of list) {
          const cur = byUser.get(e.userId);
          if (!cur || (dedupe === "latest_per_user" ? e.achievedAt > cur.achievedAt : better(decl, e.value, cur.value))) byUser.set(e.userId, e);
        }
        list = Array.from(byUser.values());
      }
      list.sort((a, b) => (a.value === b.value ? (a.achievedAt < b.achievedAt ? -1 : 1) : (better(decl, a.value, b.value) ? -1 : 1)));
      let rank = 0, prev = null;
      return list.map((e, i) => {
        if (prev === null || e.value !== prev) { rank = i + 1; prev = e.value; }
        return { rank, userId: e.userId, username: e.username, value: e.value, displayLabel: e.displayLabel || formatValue(decl, e.value), achievedAt: e.achievedAt };
      });
    }
    function checkpointBucket(boardKey) {
      H.checkpoints = H.checkpoints || new Map();
      const key = boardKey + "#" + H.attempt;
      if (!H.checkpoints.has(key)) H.checkpoints.set(key, { pending: 0, failed: 0, lastFailure: null });
      return H.checkpoints.get(key);
    }
    function readBoard(channel, decl, dims, scope, period, limit, withRows) {
      const { id, board } = getBoard(channel, decl, dims);
      let entries = board.entries.slice();
      if (scope === "following") entries = entries.filter((e) => e.followed || e.userId === VIEWER_ID);
      const windowMs = period === "daily" ? 864e5 : period === "weekly" ? 7 * 864e5 : Infinity;
      if (windowMs !== Infinity) entries = entries.filter((e) => e.userId !== VIEWER_ID || Date.now() - Date.parse(e.achievedAt) <= windowMs);
      const rows = rankRows(decl, entries);
      const mine = rows.find((r) => r.userId === VIEWER_ID) || null;
      const cp = checkpointBucket(id);
      const res = {
        channel, scope, period, dimensions: Object.assign({}, dims),
        viewerRank: mine ? Object.assign({}, mine) : null,
        standing: null,
        rankStatus: "fresh",
        rankComputedAt: new Date().toISOString(),
        totalRanked: rows.length,
        boardKey: id + "|" + scope + "|" + period,
        boardVersion: 1,
        checkpointStatus: { pending: cp.pending, failed: cp.failed, lastFailure: cp.lastFailure }
      };
      if (withRows) {
        const lim = clamp(Math.round(isNum(limit) ? limit : 25), 1, 100);
        return Object.assign({ channel, scope, period, dimensions: res.dimensions, rows: rows.slice(0, lim) }, res);
      }
      return res;
    }

    // Host requests: latency, failure injection, attempt fencing and runtime_destroyed.
    const pendingWrites = new Map();
    function hostRequest(life, opts, work) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const req = {
          attempt: H.attempt,
          kind: opts.kind,
          attemptFenced: opts.attemptFenced !== false,
          reject(err) {
            if (settled) return;
            settled = true;
            life.pending.delete(req);
            log("memory", opts.label + " → rejected [" + err.code + "]");
            reject(err);
          }
        };
        life.pending.add(req);
        const latency = opts.latencyMs != null ? opts.latencyMs : H.latencyMs;
        const failing = opts.failFlag ? opts.failFlag() : false;
        _setTimeout(async () => {
          let result, error = null;
          try {
            if (failing) throw hostError("network_error", "Network request failed (harness: fail toggle is on)", { status: 0, retryable: true });
            result = await work();
          } catch (e) {
            error = e;
          }
          if (typeof opts.after === "function") { try { opts.after(); } catch (_) {} }
          if (settled) return;
          settled = true;
          life.pending.delete(req);
          if (error) {
            log("memory", opts.label + " → rejected" + (error.code ? " [" + error.code + "]" : "") + ": " + error.message);
            reject(error);
          } else {
            log("memory", opts.label + " → " + (opts.describe ? opts.describe(result) : "ok"), opts.logResult ? result : undefined);
            resolve(result);
          }
        }, Math.max(0, latency));
      });
    }
    function trackWrite(boardKey, promise) {
      const set = pendingWrites.get(boardKey) || new Set();
      pendingWrites.set(boardKey, set);
      set.add(promise);
      const done = () => set.delete(promise);
      promise.then(done, done);
    }
    function scopePeriod(decl, o) {
      const scopes = Array.isArray(decl.scopes) && decl.scopes.length ? decl.scopes : ["global"];
      const periods = Array.isArray(decl.periods) && decl.periods.length ? decl.periods : ["all_time"];
      const scope = o.scope != null ? o.scope : (scopes.indexOf("global") >= 0 ? "global" : scopes[0]);
      const period = o.period != null ? o.period : (periods.indexOf("all_time") >= 0 ? "all_time" : periods[0]);
      if (scopes.indexOf(scope) < 0) return { error: hostError("invalid_scope", "scope \"" + scope + "\" is not declared for this record (declared: " + scopes.join(", ") + ")", { status: 400, retryable: false }) };
      if (periods.indexOf(period) < 0) return { error: hostError("invalid_period", "period \"" + period + "\" is not declared for this record (declared: " + periods.join(", ") + ")", { status: 400, retryable: false }) };
      return { scope, period };
    }
    function makeRecordOps(life, channel, decl, apiName) {
      const ops = {
        submit(value, options) {
          if (isDead(life, apiName + ".submit")) return Promise.reject(hostError("runtime_destroyed", "ctx destroyed", { status: 0, retryable: false }));
          const o = options || {};
          const label = apiName + ".submit(" + channel + ", " + value + (o.dimensions ? " " + safeJson(o.dimensions, 80) : "") + ")";
          if (!isNum(value)) return Promise.reject(hostError("invalid_value", "record value must be a finite number, got " + safeJson(value, 40), { status: 400, retryable: false }));
          const d = checkDims(decl, o.dimensions);
          if (d.error) { log("error", label + ": " + d.error); return Promise.reject(hostError("invalid_dimensions", d.error, { status: 400, retryable: false })); }
          log("memory", label + " sent (latency " + H.latencyMs + "ms" + (H.failRecords ? ", fail toggle ON" : "") + ")", o.metadata ? { metadata: o.metadata } : undefined);
          let writeResolve;
          const internal = new Promise((r) => { writeResolve = r; });
          trackWrite(boardId(channel, d.dims), internal);
          return hostRequest(life, { kind: "submit", label, failFlag: () => H.failRecords, after: () => writeResolve(), describe: (r) => "submitted " + r.displayLabel + (r.isPersonalBest ? " (personal best)" : " (not a personal best)") }, () => {
            const { improved } = applyRecord(channel, decl, d.dims, value);
            return {
              submitted: true,
              eventId: "evt_" + Math.random().toString(36).slice(2, 12),
              value,
              displayLabel: typeof o.label === "string" && o.label ? o.label : formatValue(decl, value),
              updatedPeriods: [],
              isPersonalBest: improved,
              improvedBest: improved,
              standing: null,
              pulseCapture: null,
              challenges: null
            };
          });
        },
        checkpoint(value, options) {
          if (isDead(life, apiName + ".checkpoint")) return Promise.reject(hostError("runtime_destroyed", "ctx destroyed", { status: 0, retryable: false }));
          const o = options || {};
          const label = apiName + ".checkpoint(" + channel + ", " + value + ")";
          if ((decl.dedupe || "best_per_user") !== "best_per_user") return Promise.reject(hostError("invalid_checkpoint", "checkpoint supports best_per_user records only; use submit for " + decl.dedupe, { status: 400, retryable: false }));
          if (!isNum(value)) return Promise.reject(hostError("invalid_value", "checkpoint value must be a finite number", { status: 400, retryable: false }));
          const d = checkDims(decl, o.dimensions);
          if (d.error) return Promise.reject(hostError("invalid_dimensions", d.error, { status: 400, retryable: false }));
          const key = boardId(channel, d.dims);
          const bucket = checkpointBucket(key);
          bucket.pending++;
          const checkpointId = "chk_" + Math.random().toString(36).slice(2, 12);
          const failing = H.failRecords;
          let writeResolve;
          const internal = new Promise((r) => { writeResolve = r; });
          trackWrite(key, internal);
          _setTimeout(() => {
            bucket.pending = Math.max(0, bucket.pending - 1);
            if (failing) {
              bucket.failed++;
              bucket.lastFailure = { code: "network_error", message: "Checkpoint drain failed (harness fail toggle)", checkpointId, at: new Date().toISOString() };
              log("memory", label + " drain failed (checkpointStatus.failed=" + bucket.failed + ")");
            } else {
              applyRecord(channel, decl, d.dims, value);
              log("memory", label + " drained to the board");
            }
            writeResolve();
          }, H.latencyMs);
          log("memory", label + " → queued " + checkpointId + " (receipt is not server acceptance)");
          return Promise.resolve({ queued: true, checkpointId, submitted: false });
        },
        leaderboard(options) {
          if (isDead(life, apiName + ".leaderboard")) return Promise.reject(hostError("runtime_destroyed", "ctx destroyed", { status: 0, retryable: false }));
          return readOp("leaderboard", options, true);
        },
        rank(options) {
          if (isDead(life, apiName + ".rank")) return Promise.reject(hostError("runtime_destroyed", "ctx destroyed", { status: 0, retryable: false }));
          return readOp("rank", options, false);
        },
        checkpointStatus(options) {
          const o = options || {};
          const d = checkDims(decl, o.dimensions);
          if (d.error) return Promise.reject(hostError("invalid_dimensions", d.error, { status: 400, retryable: false }));
          const b = checkpointBucket(boardId(channel, d.dims));
          return hostRequest(life, { kind: "read", label: apiName + ".checkpointStatus(" + channel + ")", latencyMs: Math.min(80, H.latencyMs), failFlag: () => H.failRecords, describe: (r) => "pending " + r.pending + ", failed " + r.failed }, () => ({ pending: b.pending, failed: b.failed, lastFailure: b.lastFailure }));
        }
      };
      function readOp(kind, options, withRows) {
        const o = options || {};
        const label = apiName + "." + kind + "(" + channel + (o.dimensions ? " " + safeJson(o.dimensions, 80) : "") + (o.scope ? " " + o.scope : "") + (o.period ? " " + o.period : "") + ")";
        const d = checkDims(decl, o.dimensions);
        if (d.error) { log("error", label + ": " + d.error); return Promise.reject(hostError("invalid_dimensions", d.error, { status: 400, retryable: false })); }
        const sp = scopePeriod(decl, o);
        if (sp.error) { log("error", label + ": " + sp.error.message); return Promise.reject(sp.error); }
        const key = boardId(channel, d.dims);
        const waitFor = Array.from(pendingWrites.get(key) || []);
        log("memory", label + " sent" + (waitFor.length ? " (waits for " + waitFor.length + " pending write" + (waitFor.length === 1 ? "" : "s") + ")" : ""));
        return hostRequest(life, {
          kind: "read", label, failFlag: () => H.failRecords,
          describe: (r) => (r.viewerRank ? "viewer rank #" + r.viewerRank.rank : "viewerRank null") + " of " + r.totalRanked + (withRows ? ", " + r.rows.length + " rows" : "")
        }, async () => {
          await Promise.allSettled(waitFor);
          return readBoard(channel, decl, d.dims, sp.scope, sp.period, o.limit, withRows);
        });
      }
      return ops;
    }

    // ---- score tracks ----
    function syncPrimary(life, reason) {
      const t = life.primary;
      if (!t) return;
      if (t.syncTimer) { _clearTimeout(t.syncTimer); t.syncTimer = 0; }
      if (t.synced === t.value) return;
      t.synced = t.value;
      log("score", "host score ← " + t.value + " (" + reason + ")");
      shell.status(statusSnapshot());
    }
    function flushPrimary(life, reason) { if (life && life.primary) syncPrimary(life, reason); }

    function makeScoreFactory(life) {
      return function score(idOrOptions, maybeOptions) {
        assertAlive(life, "ctx.game.score");
        let id = "score";
        let opts = {};
        if (typeof idOrOptions === "string") { id = idOrOptions; opts = maybeOptions || {}; }
        else if (idOrOptions && typeof idOrOptions === "object") { opts = idOrOptions; if (typeof opts.id === "string") id = opts.id; }
        const explicit = ["initial", "min", "max", "primary"].some((k) => hasOwn(opts, k));
        const initial = hasOwn(opts, "initial") ? Number(opts.initial) : 0;
        const min = opts.min != null ? Number(opts.min) : -Infinity;
        const max = opts.max != null ? Number(opts.max) : Infinity;
        const primary = hasOwn(opts, "primary") ? !!opts.primary : id === "score";
        if (!Number.isFinite(initial)) throw new TypeError("ctx.game.score: initial must be a finite number");
        if (Number.isNaN(min) || Number.isNaN(max)) throw new TypeError("ctx.game.score: min/max must be numbers");
        const sig = JSON.stringify([initial, min, max, primary]);
        const existing = life.scores.get(id);
        if (existing) {
          if (explicit && existing.sig !== sig) throw new Error("ctx.game.score(\"" + id + "\") was reopened with conflicting options");
          return existing.handle;
        }
        if (primary && life.primary) throw new Error("ctx.game.score: only one primary track may exist (\"" + life.primary.id + "\" is primary)");
        const st = { id, value: clamp(initial, min, max), previous: clamp(initial, min, max), delta: 0, lowest: clamp(initial, min, max), highest: clamp(initial, min, max), initial, primary, synced: null, syncTimer: 0, destroyed: false, listeners: new Set(), sig };
        function mutate(next, source, reason) {
          if (st.destroyed) throw new Error("score track \"" + id + "\" was used after destruction");
          if (!Number.isFinite(next)) throw new TypeError("score." + source + ": value must be finite, got " + next);
          const v = clamp(next, min, max);
          if (v === st.value) return;
          st.previous = st.value;
          st.value = v;
          st.delta = v - st.previous;
          st.lowest = Math.min(st.lowest, v);
          st.highest = Math.max(st.highest, v);
          const ev = { id, value: v, previous: st.previous, delta: st.delta, lowest: st.lowest, highest: st.highest, source };
          if (reason !== undefined) ev.reason = reason;
          for (const l of Array.from(st.listeners)) guardCall(l, "score.onChange listener", [ev]);
          if (primary && !st.syncTimer) st.syncTimer = _setTimeout(() => { st.syncTimer = 0; syncPrimary(life, "12 Hz coalesced"); }, 84);
        }
        const recordFor = (channel, api) => makeRecordOps(life, channel, recordDecl(channel, api), "score");
        const handle = {
          get id() { return id; },
          get value() { return st.value; },
          get previous() { return st.previous; },
          get delta() { return st.delta; },
          get lowest() { return st.lowest; },
          get highest() { return st.highest; },
          get initial() { return initial; },
          get primary() { return primary; },
          set(value, o) { mutate(Number(value), "set", o && o.reason); return handle; },
          add(amount, o) { mutate(st.value + Number(amount), "add", o && o.reason); return handle; },
          reset(o) {
            if (st.destroyed) throw new Error("score track \"" + id + "\" was used after destruction");
            mutate(clamp(initial, min, max), "reset", o && o.reason);
            st.lowest = st.value; st.highest = st.value; st.delta = 0;
            return handle;
          },
          flush() { if (primary) syncPrimary(life, "score.flush()"); return handle; },
          onChange(listener) {
            if (typeof listener !== "function") throw new TypeError("score.onChange needs a function");
            st.listeners.add(listener);
            return own(life, () => st.listeners.delete(listener), "score listener");
          },
          submit(channel, o) { const ops = recordFor(channel, "score.submit"); if (primary) syncPrimary(life, "flush before submit"); return ops.submit(st.value, o); },
          checkpoint(channel, o) { const ops = recordFor(channel, "score.checkpoint"); return ops.checkpoint(st.value, o); },
          rank(channel, o) { return recordFor(channel, "score.rank").rank(o); },
          leaderboard(channel, o) { return recordFor(channel, "score.leaderboard").leaderboard(o); },
          checkpointStatus(channel, o) { return recordFor(channel, "score.checkpointStatus").checkpointStatus(o); }
        };
        const guarded = guard(handle, "game.score(\"" + id + "\")", "score");
        life.scores.set(id, { handle: guarded, sig });
        if (primary) { life.primary = st; st.synced = st.value; }
        own(life, () => {
          if (primary) syncPrimary(life, "cleanup");
          st.destroyed = true;
          if (st.syncTimer) _clearTimeout(st.syncTimer);
          st.listeners.clear();
          if (life.primary === st) life.primary = null;
          life.scores.delete(id);
        }, "score track");
        return guarded;
      };
    }

    // ---- ctx.memory ----
    function makeMemory(life) {
      function localDecl(channel) {
        const decl = (H.manifest.memory && H.manifest.memory.local) || {};
        if (typeof channel !== "string" || !hasOwn(decl, channel)) {
          const msg = "ctx.memory.local: channel \"" + channel + "\" is not declared in manifest.memory.local (declared: " + (Object.keys(decl).join(", ") || "none") + ")";
          log("error", msg);
          const e = new Error(msg); e.code = "undeclared_channel"; throw e;
        }
      }
      function familyDecl(family, channel, api) {
        const decl = (H.manifest.memory && H.manifest.memory[family]) || {};
        if (typeof channel !== "string" || !hasOwn(decl, channel)) {
          const msg = api + ": channel \"" + channel + "\" is not declared in manifest.memory." + family + " (declared: " + (Object.keys(decl).join(", ") || "none") + ")";
          log("error", msg);
          const e = new Error(msg); e.code = "undeclared_channel"; throw e;
        }
        return decl[channel];
      }
      return {
        local(channel) {
          localDecl(channel);
          const key = storageKey("local:" + channel);
          return guard({
            get() {
              if (isDead(life, "memory.local.get")) return Promise.reject(hostError("runtime_destroyed", "ctx destroyed", { status: 0, retryable: false }));
              return hostRequest(life, { kind: "local", attemptFenced: false, label: "memory.local(" + channel + ").get()", latencyMs: 30, failFlag: () => H.failLocal, describe: (r) => (r.value === null ? "empty (value null)" : "value " + safeJson(r.value, 120)) }, () => {
                const rec = readJson(key, null);
                return rec ? { value: rec.value, updatedAt: rec.updatedAt } : { value: null, updatedAt: null };
              });
            },
            set(value) {
              if (isDead(life, "memory.local.set")) return Promise.reject(hostError("runtime_destroyed", "ctx destroyed", { status: 0, retryable: false }));
              let text;
              try { text = JSON.stringify(value); } catch (e) { return Promise.reject(hostError("invalid_value", "memory.local value must be JSON-serializable: " + e.message, { status: 400, retryable: false })); }
              if (text === undefined) return Promise.reject(hostError("invalid_value", "memory.local value must be JSON-serializable", { status: 400, retryable: false }));
              const bytes = new Blob([text]).size;
              if (bytes > 8192) return Promise.reject(hostError("payload_too_large", "memory.local value is " + bytes + " bytes; the limit is 8192", { status: 413, retryable: false }));
              return hostRequest(life, { kind: "local", attemptFenced: false, label: "memory.local(" + channel + ").set(" + safeJson(value, 120) + ")", latencyMs: 30, failFlag: () => H.failLocal, describe: () => "saved (" + bytes + " bytes)" }, () => {
                const rec = { value: JSON.parse(text), updatedAt: new Date().toISOString() };
                writeJson(key, rec);
                return { value: JSON.parse(text), updatedAt: rec.updatedAt };
              });
            }
          }, "memory.local(\"" + channel + "\")", "storage");
        },
        record(channel) {
          const decl = recordDecl(channel, "ctx.memory.record");
          return guard(makeRecordOps(life, channel, decl, "memory.record"), "memory.record(\"" + channel + "\")", "record");
        },
        tally(channel) {
          familyDecl("tallies", channel, "ctx.memory.tally");
          const key = storageKey("tally:" + channel);
          return {
            choose(value) {
              return hostRequest(life, { kind: "tally", attemptFenced: false, label: "memory.tally(" + channel + ").choose(" + safeJson(value, 60) + ")", failFlag: () => H.failRecords }, () => {
                const st = readJson(key, { counts: {}, mine: null });
                const answerKey = typeof value === "string" ? value : safeJson(value, 60);
                if (st.mine && st.counts[st.mine.answerKey]) st.counts[st.mine.answerKey]--;
                st.counts[answerKey] = (st.counts[answerKey] || 0) + 1;
                st.mine = { answer: value, answerKey, updatedAt: new Date().toISOString() };
                writeJson(key, st);
                return { submitted: true, eventId: "evt_" + Math.random().toString(36).slice(2, 12), answer: value, answerKey };
              });
            },
            results() {
              return hostRequest(life, { kind: "tally", attemptFenced: false, label: "memory.tally(" + channel + ").results()", failFlag: () => H.failRecords }, () => {
                const st = readJson(key, { counts: {}, mine: null });
                return { channel, results: Object.keys(st.counts).map((k) => ({ answerKey: k, count: st.counts[k] })), viewerResponse: st.mine };
              });
            }
          };
        },
        world(channel) {
          familyDecl("worlds", channel, "ctx.memory.world");
          const key = storageKey("world:" + channel);
          return {
            get() {
              return hostRequest(life, { kind: "world", attemptFenced: false, label: "memory.world(" + channel + ").get()", failFlag: () => H.failRecords }, () => {
                const st = readJson(key, { state: {}, version: 0, updatedAt: null });
                return { channel, state: st.state, version: st.version, updatedAt: st.updatedAt };
              });
            },
            mutate(mutation) {
              return hostRequest(life, { kind: "world", attemptFenced: false, label: "memory.world(" + channel + ").mutate(" + safeJson(mutation, 80) + ")", failFlag: () => H.failRecords }, () => {
                const st = readJson(key, { state: {}, version: 0, updatedAt: null });
                const id = mutation && mutation.id != null ? String(mutation.id) : (mutation && mutation.x != null ? mutation.x + "," + mutation.y : "patch");
                if (mutation && (mutation.delete === true || mutation.op === "delete")) delete st.state[id];
                else st.state[id] = mutation;
                st.version++;
                st.updatedAt = new Date().toISOString();
                writeJson(key, st);
                return { mutated: true, eventId: "evt_" + Math.random().toString(36).slice(2, 12), snapshot: { channel, state: st.state, version: st.version, updatedAt: st.updatedAt } };
              });
            }
          };
        }
      };
    }

    // ---- ctx.game.progress (viewer-private Continue Playing state, in-memory per page) ----
    function makeProgress(life) {
      const declOf = (channel, api) => {
        const decl = (H.manifest.game && H.manifest.game.progress) || {};
        if (!hasOwn(decl, channel)) {
          const msg = api + ": progress channel \"" + channel + "\" is not declared in manifest.game.progress (declared: " + (Object.keys(decl).join(", ") || "none") + ")";
          log("error", msg);
          const e = new Error(msg); e.code = "undeclared_channel"; throw e;
        }
        return decl[channel];
      };
      const emptyDoc = (channel) => ({ channel, status: "empty", state: null, label: null, percent: null, dimensions: null, metadata: null, stateSchemaVersion: null, updatedAt: null, lastSavedAt: null, completedAt: null, abandonedAt: null, expiresAt: null, resumeEligible: false, resumeIneligibleReason: "empty" });
      const get = (channel) => H.progress.get(channel) || emptyDoc(channel);
      const req = (label, fn) => hostRequest(life, { kind: "progress", attemptFenced: false, label, latencyMs: Math.min(120, H.latencyMs), failFlag: () => H.failLocal, describe: (r) => "status " + r.status + ", resumeEligible " + r.resumeEligible }, fn);
      function splitArgs(a, b, c, mode) {
        const decl = (H.manifest.game && H.manifest.game.progress) || {};
        if (typeof a === "string" && hasOwn(decl, a)) return { channel: a, x: b, y: c };
        if (mode === "save" && typeof a === "string" && !hasOwn(decl, a) && (b !== undefined)) return { channel: a, x: b, y: c };
        return { channel: "main", x: a, y: b };
      }
      return {
        load(channelId) {
          const channel = channelId == null ? "main" : channelId;
          declOf(channel, "ctx.game.progress.load");
          return req("game.progress.load(" + channel + ")", () => clone(get(channel)));
        },
        save(a, b, c) {
          const { channel, x, y } = splitArgs(a, b, c, "save");
          const decl = declOf(channel, "ctx.game.progress.save");
          let payload;
          if (x && typeof x === "object" && !Array.isArray(x) && (hasOwn(x, "state") || hasOwn(x, "value"))) payload = Object.assign({}, x, { state: hasOwn(x, "state") ? x.state : x.value });
          else payload = Object.assign({}, y || {}, { state: x });
          let text;
          try { text = JSON.stringify(payload.state); } catch (e) { return Promise.reject(hostError("invalid_state", "progress state must be JSON-serializable", { status: 400, retryable: false })); }
          if (text && new Blob([text]).size > 8192) return Promise.reject(hostError("payload_too_large", "progress state exceeds 8192 bytes", { status: 413, retryable: false }));
          return req("game.progress.save(" + channel + ")", () => {
            const t = new Date().toISOString();
            const d = Object.assign(get(channel), {
              status: "in_progress", state: text === undefined ? null : JSON.parse(text), label: payload.label ?? null, percent: isNum(payload.percent) ? clamp(payload.percent, 0, 1) : null,
              dimensions: payload.dimensions ?? null, metadata: payload.metadata ?? null, stateSchemaVersion: payload.stateSchemaVersion ?? decl.stateSchemaVersion ?? null,
              updatedAt: t, lastSavedAt: t, completedAt: null, abandonedAt: null, expiresAt: new Date(Date.now() + (decl.ttlDays || 30) * 864e5).toISOString(), resumeEligible: true, resumeIneligibleReason: null
            });
            H.progress.set(channel, d);
            return clone(d);
          });
        },
        complete(a, b) {
          const { channel, x } = splitArgs(a, b, undefined, "end");
          declOf(channel, "ctx.game.progress.complete");
          return req("game.progress.complete(" + channel + ")", () => {
            const t = new Date().toISOString();
            const d = Object.assign(get(channel), { status: "completed", completedAt: t, updatedAt: t, resumeEligible: false, resumeIneligibleReason: "completed" });
            if (x && typeof x === "object" && hasOwn(x, "state")) d.state = clone(x.state);
            H.progress.set(channel, d);
            return clone(d);
          });
        },
        abandon(a, b) {
          const { channel, x } = splitArgs(a, b, undefined, "end");
          declOf(channel, "ctx.game.progress.abandon");
          return req("game.progress.abandon(" + channel + ")", () => {
            const t = new Date().toISOString();
            const d = Object.assign(get(channel), { status: "abandoned", abandonedAt: t, updatedAt: t, resumeEligible: false, resumeIneligibleReason: "abandoned" });
            if (x && typeof x === "object" && hasOwn(x, "state")) d.state = clone(x.state);
            H.progress.set(channel, d);
            return clone(d);
          });
        }
      };
    }

    // ---- ctx.platform / ctx.pulse / ctx.share ----
    const HAPTICS = ["light", "medium", "heavy", "success", "warning", "error"];
    function checkPayload(name, payload) {
      if (payload === undefined) return;
      let text;
      try { text = JSON.stringify(payload); } catch (e) { warnOnce("payload:" + name, "platform." + name + " payload is not serializable: " + e.message); return; }
      if (text && text.length > 4096) warnOnce("payload-size:" + name, "platform." + name + " payload is " + text.length + " characters; keep payloads small");
    }
    function makePlatform(life) {
      const note = (name, payload, extra) => {
        if (isDead(life, "ctx.platform." + name)) return false;
        checkPayload(name, payload);
        log("platform", "platform." + name + (extra || ""), payload);
        return true;
      };
      return {
        ready(payload) {
          if (!note("ready", payload)) return;
          life.readyCalled = true;
          shell.visualReady("platform.ready()");
        },
        start(payload) {
          if (isDead(life, "ctx.platform.start")) return;
          H.attempt++;
          checkPayload("start", payload);
          let fenced = 0;
          for (const r of Array.from(life.pending)) {
            if (r.attemptFenced && r.attempt < H.attempt) { fenced++; r.reject(hostError("runtime_attempt_changed", "A new attempt started (ctx.platform.start) before this result settled", { status: 0, retryable: false })); }
          }
          log("platform", "platform.start → attempt " + H.attempt + (fenced ? " (rejected " + fenced + " pending result observer" + (fenced === 1 ? "" : "s") + " from the previous attempt with runtime_attempt_changed; their writes still land)" : ""), payload);
          if (H.onboarding) H.onboarding.onInteract("start");
          shell.status(statusSnapshot());
        },
        interact(payload) {
          if (!note("interact", payload)) return;
          if (H.onboarding) H.onboarding.onInteract("interact");
        },
        setScore(score, payload) {
          if (!isNum(Number(score))) warnOnce("setScore-nan", "platform.setScore expects a finite number, got " + safeJson(score, 40));
          note("setScore", payload, "(" + score + ")");
        },
        setProgress(value, payload) {
          if (!isNum(value) || value < 0 || value > 1) warnOnce("setProgress-range", "platform.setProgress expects 0..1, got " + safeJson(value, 40));
          note("setProgress", payload, "(" + value + ")");
        },
        milestone(name, payload) { note("milestone", payload, "(\"" + name + "\")"); },
        complete(payload) {
          flushPrimary(life, "platform.complete");
          if (note("complete", payload) && payload && payload.pulse === true) log("platform", "platform.complete payload.pulse=true → implicit Pulse requested");
        },
        fail(payload) { flushPrimary(life, "platform.fail"); note("fail", payload); },
        error(payload) { note("error", payload); },
        emit(name, payload) { note("emit", payload, "(\"" + name + "\")"); },
        haptic(type) {
          if (!hasPerm("haptics")) {
            log("error", "platform.haptic(\"" + type + "\") without the \"haptics\" permission → NotAllowedError");
            throw notAllowed("ctx.platform.haptic requires the \"haptics\" permission in manifest.permissions");
          }
          if (isDead(life, "ctx.platform.haptic")) return;
          if (HAPTICS.indexOf(type) < 0) warnOnce("haptic-type:" + type, "platform.haptic(\"" + type + "\"): unknown type (use " + HAPTICS.join(" | ") + ")");
          log("platform", "platform.haptic(\"" + type + "\")");
          shell.haptic(String(type));
        }
      };
    }
    function makePulse(life) {
      return {
        complete(options) {
          if (isDead(life, "ctx.pulse.complete")) return;
          flushPrimary(life, "pulse.complete");
          checkPayload("pulse.complete", options);
          log("platform", "pulse.complete" + (options && options.captureMode === "none" ? " (no capture)" : " (host would capture the current screen)"), options);
        }
      };
    }
    function makeShare(life) {
      return function share(options) {
        if (isDead(life, "ctx.share")) return;
        const o = options || {};
        const limits = { sceneId: 96, title: 200, text: 2000, implicitText: 500, imageRole: 48 };
        for (const k of Object.keys(limits)) if (typeof o[k] === "string" && o[k].length > limits[k]) warnOnce("share-" + k, "ctx.share " + k + " is " + o[k].length + " characters (max " + limits[k] + ")");
        log("platform", "share request (sceneId " + (o.sceneId || "default") + ")", o);
      };
    }

    // ---------------------------------------------------------------------------------------------
    // ctx.music: a quiet WebAudio pad (two detuned oscillators → lowpass → gain) plus stings
    // ---------------------------------------------------------------------------------------------
    const MUSIC_PRESETS = {
      ambient: { wave: "sine", root: 220, tempo: 70, scale: "major" },
      pulse: { wave: "square", root: 196, tempo: 110, scale: "minor" },
      arcade: { wave: "square", root: 261.63, tempo: 128, scale: "major" },
      drift: { wave: "triangle", root: 174.61, tempo: 80, scale: "lydian" },
      sparkle: { wave: "triangle", root: 523.25, tempo: 100, scale: "pentatonic" },
      techno: { wave: "sawtooth", root: 110, tempo: 128, scale: "minor" },
      house: { wave: "sawtooth", root: 130.81, tempo: 122, scale: "dorian" },
      chiptune: { wave: "square", root: 261.63, tempo: 140, scale: "major" },
      drone: { wave: "sawtooth", root: 98, tempo: 60, scale: "minor" },
      lofi: { wave: "triangle", root: 196, tempo: 80, scale: "dorian" },
      synthwave: { wave: "sawtooth", root: 146.83, tempo: 100, scale: "minor" },
      jungle: { wave: "square", root: 110, tempo: 165, scale: "minorPentatonic" },
      cozy: { wave: "triangle", root: 196, tempo: 84, scale: "major" },
      spooky: { wave: "sawtooth", root: 155.56, tempo: 70, scale: "hirajoshi" },
      triumph: { wave: "sawtooth", root: 196, tempo: 112, scale: "major" },
      bubble: { wave: "sine", root: 329.63, tempo: 104, scale: "pentatonic" }
    };
    const MUSIC_SCALES = {
      major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], pentatonic: [0, 2, 4, 7, 9], minorPentatonic: [0, 3, 5, 7, 10],
      blues: [0, 3, 5, 6, 7, 10], dorian: [0, 2, 3, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], wholeTone: [0, 2, 4, 6, 8, 10],
      hirajoshi: [0, 2, 3, 7, 8], chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    };
    const MUSIC_STINGS = {
      tap: { wave: "square", root: 880, intervals: [0, 7], durations: [0.045, 0.07] },
      coin: { wave: "square", root: 987.77, intervals: [0, 5], durations: [0.07, 0.24] },
      success: { wave: "triangle", root: 523.25, intervals: [0, 4, 7], durations: [0.09, 0.09, 0.2] },
      fail: { wave: "sawtooth", root: 392, intervals: [0, -3, -6], durations: [0.12, 0.12, 0.26] },
      danger: { wave: "square", root: 466.16, intervals: [0, 6, 0], durations: [0.1, 0.1, 0.14] },
      powerup: { wave: "square", root: 440, intervals: [0, 7, 12], durations: [0.06, 0.06, 0.16] },
      win: { wave: "triangle", root: 659.25, intervals: [0, 5, 12], durations: [0.12, 0.12, 0.38] },
      lose: { wave: "triangle", root: 329.63, intervals: [0, -1, -5], durations: [0.18, 0.18, 0.42] }
    };
    const DEFAULT_PATTERN = [0, 4, 5, 3];

    function createMusicEngine() {
      let ac = null, master = null;
      let bed = null;            // current bed (null when none)
      let generation = 0;
      let stoppedOnce = false;
      let pausedByBit = false;
      let lastError = null;
      let readyWaiters = [];
      const settings = { preset: "ambient", tempo: 70, volume: 0.5, intensity: 0.5, density: 0.5, swing: 0, filterCutoff: null, scale: "major", scaleFreqs: null, root: 220, transpose: 0, pattern: DEFAULT_PATTERN.slice(), wave: "sine" };

      function ensureContext() {
        if (!ac) {
          ac = new _AudioContext();
          master = ac.createGain();
          master.gain.value = H.muted ? 0 : 1;
          master.connect(ac.destination);
          ac.onstatechange = () => { if (ac && ac.state === "running") flushReady(); };
        }
        return ac;
      }
      function running() { return !!ac && ac.state === "running"; }
      function flushReady() {
        if (!running()) return;
        if (bed && !bed.started) startBedNodes(bed);
        const w = readyWaiters; readyWaiters = [];
        for (const r of w) r(stateName());
      }
      function stateName() {
        if (H.hostPaused && ac) return "paused";
        if (!running()) return "locked";
        if (bed) return pausedByBit ? "paused" : "playing";
        return stoppedOnce ? "stopped" : "ready";
      }
      function errorInfo() {
        if (H.hostPaused) return { message: "The Bit is inactive; Plethora paused its audio", code: "host_paused", name: "HostPausedError" };
        return lastError;
      }
      function freqFor(step) {
        if (Array.isArray(settings.scaleFreqs) && settings.scaleFreqs.length) return settings.scaleFreqs[((step % settings.scaleFreqs.length) + settings.scaleFreqs.length) % settings.scaleFreqs.length];
        const sc = MUSIC_SCALES[settings.scale] || MUSIC_SCALES.major;
        const oct = Math.floor(step / sc.length);
        const semis = sc[((step % sc.length) + sc.length) % sc.length] + 12 * oct + (settings.transpose || 0);
        return settings.root * Math.pow(2, semis / 12);
      }
      function bedGain() { return 0.25 * settings.volume * (0.45 + 0.55 * settings.intensity); }
      function cutoff() { return clamp(settings.filterCutoff != null ? settings.filterCutoff : 350 + 2600 * Math.pow(settings.intensity, 1.2), 220, 12000); }
      function startBedNodes(b) {
        const t = ac.currentTime;
        b.filter = ac.createBiquadFilter();
        b.filter.type = "lowpass";
        b.filter.Q.value = 0.8;
        b.filter.frequency.value = cutoff();
        b.gain = ac.createGain();
        b.gain.gain.value = 0;
        b.duck = ac.createGain();
        b.duck.gain.value = 1;
        b.oscs = [-7, 7].map((cents) => {
          const o = ac.createOscillator();
          o.type = settings.wave;
          o.detune.value = cents;
          o.frequency.value = freqFor(settings.pattern[0] || 0);
          o.connect(b.filter);
          o.start(t);
          return o;
        });
        b.filter.connect(b.gain);
        b.gain.connect(b.duck);
        b.duck.connect(master);
        b.gain.gain.setTargetAtTime(pausedByBit ? 0 : bedGain(), t, Math.max(0.02, (b.fadeInMs || 600) / 3000));
        b.started = true;
        b.step = 0;
        scheduleSteps(b);
        log("music", "music bed audible (" + settings.preset + ", " + settings.tempo + " bpm, " + settings.scale + ")");
      }
      function scheduleSteps(b) {
        if (b.stepTimer) _clearInterval(b.stepTimer);
        const ms = (60 / settings.tempo) * 2 * 1000;
        b.stepTimer = _setInterval(() => {
          if (!b.started || !ac || bed !== b) return;
          b.step = (b.step + 1) % Math.max(1, settings.pattern.length);
          const deg = settings.pattern[b.step];
          if (deg === null || deg === undefined || deg === -1 || deg === "-" || deg === "rest") return;
          const f = freqFor(Number(deg) || 0);
          for (const o of b.oscs) o.frequency.setTargetAtTime(f, ac.currentTime, 0.06);
        }, ms);
      }
      function retune(fadeMs) {
        if (!bed || !bed.started || !ac) return;
        const tc = Math.max(0.01, (fadeMs || 120) / 3000);
        bed.filter.frequency.setTargetAtTime(cutoff(), ac.currentTime, tc);
        if (!pausedByBit) bed.gain.gain.setTargetAtTime(bedGain(), ac.currentTime, tc);
        for (const o of bed.oscs) o.type = settings.wave;
      }
      function killBed(b, fadeOutMs) {
        if (!b) return;
        if (b.stepTimer) _clearInterval(b.stepTimer);
        if (b.started && ac) {
          const t = ac.currentTime;
          const fade = Math.max(0.01, (fadeOutMs == null ? 400 : fadeOutMs) / 1000);
          try {
            b.gain.gain.cancelScheduledValues(t);
            b.gain.gain.setValueAtTime(b.gain.gain.value, t);
            b.gain.gain.linearRampToValueAtTime(0, t + fade);
            for (const o of b.oscs) o.stop(t + fade + 0.05);
          } catch (_) {}
          _setTimeout(() => { try { b.duck.disconnect(); } catch (_) {} }, (fade + 0.1) * 1000);
        }
        b.started = false;
      }
      function applyOptions(o) {
        if (!o) return;
        if (typeof o.preset === "string") {
          if (!MUSIC_PRESETS[o.preset]) { log("warn", "music: unknown preset \"" + o.preset + "\" falls back to ambient"); }
          const p = MUSIC_PRESETS[o.preset] || MUSIC_PRESETS.ambient;
          settings.preset = MUSIC_PRESETS[o.preset] ? o.preset : "ambient";
          settings.wave = p.wave; settings.root = p.root; settings.tempo = p.tempo; settings.scale = p.scale; settings.scaleFreqs = null;
        }
        if (isNum(o.volume)) settings.volume = clamp(o.volume, 0, 0.9);
        if (isNum(o.tempo)) settings.tempo = clamp(o.tempo, 40, 220);
        if (isNum(o.intensity)) settings.intensity = clamp(o.intensity, 0, 1);
        if (isNum(o.density)) settings.density = clamp(o.density, 0, 1);
        if (isNum(o.swing)) settings.swing = clamp(o.swing, 0, 0.42);
        if (isNum(o.filterCutoff)) settings.filterCutoff = clamp(o.filterCutoff, 220, 12000);
        if (typeof o.wave === "string") settings.wave = o.wave;
        if (isNum(o.root)) settings.root = o.root;
        if (isNum(o.transpose)) settings.transpose = o.transpose;
        if (typeof o.scale === "string") { settings.scale = MUSIC_SCALES[o.scale] ? o.scale : settings.scale; settings.scaleFreqs = null; }
        else if (Array.isArray(o.scale)) settings.scaleFreqs = o.scale.filter(isNum);
        if (Array.isArray(o.pattern)) settings.pattern = o.pattern.slice();
        else if (o.pattern && Array.isArray(o.pattern.notes)) settings.pattern = o.pattern.notes.slice();
      }
      function details() {
        return { preset: settings.preset, presets: Object.keys(MUSIC_PRESETS), scales: Object.keys(MUSIC_SCALES), stings: Object.keys(MUSIC_STINGS), tempo: settings.tempo, volume: settings.volume, intensity: settings.intensity, density: settings.density, swing: settings.swing, filterCutoff: settings.filterCutoff != null ? settings.filterCutoff : Math.round(cutoff()), error: errorInfo() };
      }
      function requirePerm(what, asyncCall) {
        if (hasPerm("backgroundMusic")) return null;
        const err = notAllowed("ctx.music." + what + " requires the \"backgroundMusic\" permission in manifest.permissions");
        log("error", "music." + what + " without the \"backgroundMusic\" permission → NotAllowedError");
        if (asyncCall) return err;
        throw err;
      }
      function unlock() {
        const denied = requirePerm("unlock", true);
        if (denied) return Promise.reject(denied);
        try { ensureContext(); } catch (e) { lastError = { message: e.message, code: "audio_unavailable", name: e.name }; return Promise.resolve(stateName()); }
        if (H.hostPaused) return Promise.resolve(stateName());
        return new Promise((resolve) => {
          let done = false;
          const finish = () => { if (done) return; done = true; flushReady(); resolve(stateName()); };
          ac.resume().then(finish, finish);
          _setTimeout(finish, 450);
        });
      }
      function play(optionsOrPreset, verb) {
        requirePerm(verb);
        const o = typeof optionsOrPreset === "string" ? { preset: optionsOrPreset } : (optionsOrPreset || {});
        ensureContext();
        if (bed) killBed(bed, 250);
        if (o.preset == null && typeof optionsOrPreset !== "string") applyOptions({ preset: settings.preset });
        applyOptions(o);
        generation++;
        pausedByBit = false;
        stoppedOnce = false;
        bed = { gen: generation, started: false, fadeInMs: isNum(o.fadeInMs) ? o.fadeInMs : 600 };
        if (running() && !H.hostPaused) startBedNodes(bed);
        else { ac.resume().catch(() => {}); log("music", "music bed waiting for audio unlock (state " + stateName() + ")"); }
        return makeHandle(generation);
      }
      function current(gen) { return bed && (gen === undefined || bed.gen === gen) ? bed : null; }
      function stop(opts, gen) {
        const b = current(gen);
        if (!b) return;
        const o = opts || {};
        killBed(b, isNum(o.fadeOutMs) ? o.fadeOutMs : 400);
        bed = null;
        stoppedOnce = true;
        pausedByBit = false;
        if (o.close && ac) {
          const old = ac;
          ac = null; master = null;
          _setTimeout(() => { try { old.close(); } catch (_) {} }, (isNum(o.fadeOutMs) ? o.fadeOutMs : 400) + 120);
        }
      }
      function pause(gen) {
        const b = current(gen);
        if (!b) return;
        pausedByBit = true;
        if (b.started && ac) b.gain.gain.setTargetAtTime(0, ac.currentTime, 0.05);
      }
      function resume(gen) {
        const b = current(gen);
        if (!b) return Promise.resolve(stateName());
        pausedByBit = false;
        if (b.started && ac) b.gain.gain.setTargetAtTime(bedGain(), ac.currentTime, 0.08);
        return unlock();
      }
      function duck(amount, ms, gen) {
        const b = current(gen);
        if (!b || !b.started || !ac) return;
        const a = clamp(Number(amount) || 0, 0, 0.95);
        const dur = Math.max(0, Number(ms) || 300) / 1000;
        const t = ac.currentTime;
        b.duck.gain.cancelScheduledValues(t);
        b.duck.gain.setValueAtTime(b.duck.gain.value, t);
        b.duck.gain.linearRampToValueAtTime(1 - a, t + 0.03);
        b.duck.gain.linearRampToValueAtTime(1, t + 0.03 + dur);
      }
      function sting(nameOrOpts, opts) {
        const denied = requirePerm("sting", true);
        if (denied) return Promise.reject(denied);
        const base = typeof nameOrOpts === "string" ? { name: nameOrOpts } : Object.assign({}, nameOrOpts || {});
        const o = Object.assign(base, opts || {});
        const def = MUSIC_STINGS[o.name] || (o.intervals ? {} : MUSIC_STINGS.tap);
        if (o.name && !MUSIC_STINGS[o.name] && !o.intervals) log("warn", "music.sting(\"" + o.name + "\"): unknown sting name, playing \"tap\"");
        const wave = o.wave || def.wave || "triangle";
        const root = clamp(isNum(o.root) ? o.root : (def.root || 660), 40, 1600);
        const vol = clamp(isNum(o.volume) ? o.volume : 0.25, 0, 0.5);
        const intervals = Array.isArray(o.intervals) ? o.intervals : def.intervals;
        const durations = Array.isArray(o.durations) ? o.durations : def.durations || intervals.map(() => 0.1);
        if (H.hostPaused) return Promise.reject(hostError("host_paused", "The Bit is inactive; Plethora paused its audio", { name: "HostPausedError" }));
        try { ensureContext(); } catch (e) { return Promise.reject(e); }
        const playNotes = () => {
          const g = ac.createGain();
          g.gain.value = H.muted ? 0 : 1;
          g.connect(master);
          let t = ac.currentTime + 0.01;
          for (let i = 0; i < intervals.length; i++) {
            const d = Math.max(0.02, Number(durations[i] != null ? durations[i] : durations[durations.length - 1]) || 0.1);
            const osc = ac.createOscillator();
            const env = ac.createGain();
            osc.type = wave;
            osc.frequency.value = root * Math.pow(2, (Number(intervals[i]) || 0) / 12);
            env.gain.setValueAtTime(0, t);
            env.gain.linearRampToValueAtTime(vol, t + 0.008);
            env.gain.exponentialRampToValueAtTime(0.0008, t + d);
            osc.connect(env);
            env.connect(g);
            osc.start(t);
            osc.stop(t + d + 0.02);
            t += d * 0.92;
          }
          return new Promise((resolve) => _setTimeout(() => { try { g.disconnect(); } catch (_) {} resolve(); }, (t - ac.currentTime) * 1000 + 60));
        };
        if (running()) return playNotes();
        return new Promise((resolve, reject) => {
          let done = false;
          const go = () => { if (done) return; done = true; if (running()) playNotes().then(resolve); else { const e = hostError("audio_locked", "Audio is locked: call ctx.music.unlock() inside a user gesture first", { name: "NotAllowedError" }); reject(e); } };
          ac.resume().then(go, go);
          _setTimeout(go, 350);
        });
      }
      function readyPromise() {
        if (running()) return Promise.resolve(stateName());
        return new Promise((r) => readyWaiters.push(r));
      }
      function makeHandle(gen) {
        const stale = (what) => {
          if (bed && bed.gen === gen) return false;
          warnOnce("stale-music:" + gen + ":" + what, "music handle #" + gen + "." + what + "() ignored: a newer ctx.music.play() replaced this bed (or it was stopped)");
          return true;
        };
        const h = {
          stop(o) { log("music", "handle.stop", o); if (!stale("stop")) stop(o, gen); },
          pause() { log("music", "handle.pause"); if (!stale("pause")) pause(gen); },
          resume() { log("music", "handle.resume"); return stale("resume") ? Promise.resolve(stateName()) : resume(gen); },
          unlock() { log("music", "handle.unlock"); return unlock(); },
          setVolume(v, o) { log("music", "handle.setVolume(" + v + ")"); if (!stale("setVolume")) { settings.volume = clamp(Number(v) || 0, 0, 0.9); retune(o && o.fadeMs); } },
          setPreset(name, o) { log("music", "handle.setPreset(\"" + name + "\")"); if (!stale("setPreset")) { applyOptions(Object.assign({}, o || {}, { preset: name })); retune(o && o.fadeMs); if (bed && bed.started) scheduleSteps(bed); } },
          setTempo(bpm) { log("music", "handle.setTempo(" + bpm + ")"); if (!stale("setTempo")) { settings.tempo = clamp(Number(bpm) || settings.tempo, 40, 220); if (bed && bed.started) scheduleSteps(bed); } },
          setIntensity(v, o) { log("music", "handle.setIntensity(" + v + ")"); if (!stale("setIntensity")) { settings.intensity = clamp(Number(v) || 0, 0, 1); retune(o && o.fadeMs); } },
          setScale(s, o) { log("music", "handle.setScale(" + safeJson(s, 60) + ")"); if (!stale("setScale")) applyOptions(Object.assign({}, o || {}, { scale: s })); },
          setPattern(p) { log("music", "handle.setPattern(" + safeJson(p, 60) + ")"); if (!stale("setPattern")) applyOptions({ pattern: p }); },
          duck(a, ms) { log("music", "handle.duck(" + a + ", " + ms + ")"); if (!stale("duck")) duck(a, ms, gen); },
          sting(n, o) { log("music", "handle.sting(" + safeJson(n, 60) + ")"); return sting(n, o); },
          state() { return bed && bed.gen === gen ? stateName() : (H.hostPaused ? "paused" : "stopped"); },
          details,
          error: errorInfo,
          ready: readyPromise,
          get playing() { return !!(bed && bed.gen === gen && bed.started && !pausedByBit && !H.hostPaused && running()); },
          get preset() { return settings.preset; }
        };
        return guard(h, "music handle", "musicHandle");
      }
      return {
        api(life) {
          const ns = {
            presets: Object.keys(MUSIC_PRESETS),
            scales: Object.keys(MUSIC_SCALES),
            stings: Object.keys(MUSIC_STINGS),
            unlock() { log("music", "music.unlock()"); return unlock(); },
            play(o) { log("music", "music.play(" + safeJson(o, 160) + ")"); if (isDead(life, "ctx.music.play")) return makeHandle(-1); return play(o, "play"); },
            start(o) { log("music", "music.start(" + safeJson(o, 160) + ")"); if (isDead(life, "ctx.music.start")) return makeHandle(-1); return play(o, "start"); },
            stop(o) { log("music", "music.stop", o); stop(o); },
            pause() { log("music", "music.pause()"); pause(); },
            resume() { log("music", "music.resume()"); return resume(); },
            setVolume(v, o) { requirePerm("setVolume"); log("music", "music.setVolume(" + v + ")"); settings.volume = clamp(Number(v) || 0, 0, 0.9); retune(o && o.fadeMs); },
            setPreset(name, o) { requirePerm("setPreset"); log("music", "music.setPreset(\"" + name + "\")"); applyOptions(Object.assign({}, o || {}, { preset: name })); retune(o && o.fadeMs); if (bed && bed.started) scheduleSteps(bed); },
            setTempo(bpm) { requirePerm("setTempo"); log("music", "music.setTempo(" + bpm + ")"); settings.tempo = clamp(Number(bpm) || settings.tempo, 40, 220); if (bed && bed.started) scheduleSteps(bed); },
            setIntensity(v, o) { requirePerm("setIntensity"); log("music", "music.setIntensity(" + v + ")"); settings.intensity = clamp(Number(v) || 0, 0, 1); retune(o && o.fadeMs); },
            setScale(s, o) { requirePerm("setScale"); log("music", "music.setScale(" + safeJson(s, 60) + ")"); applyOptions(Object.assign({}, o || {}, { scale: s })); },
            setPattern(p) { requirePerm("setPattern"); log("music", "music.setPattern(" + safeJson(p, 60) + ")"); applyOptions({ pattern: p }); },
            duck(a, ms) { log("music", "music.duck(" + a + ", " + ms + ")"); duck(a, ms); },
            sting(n, o) { log("music", "music.sting(" + safeJson(n, 60) + ")"); return sting(n, o); },
            state: stateName,
            details,
            error: errorInfo,
            ready: readyPromise,
            get playing() { return !!(bed && bed.started && !pausedByBit && !H.hostPaused && running()); },
            get preset() { return settings.preset; }
          };
          return ns;
        },
        setMuted(m) { if (master && ac) master.gain.setTargetAtTime(m ? 0 : 1, ac.currentTime, 0.03); },
        hostPause() { if (ac) { try { ac.suspend(); } catch (_) {} } },
        hostResume() { if (ac) { ac.resume().then(flushReady, () => {}); } },
        teardown(reason) {
          if (bed) killBed(bed, 60);
          bed = null;
          stoppedOnce = false;
          pausedByBit = false;
          lastError = null;
          readyWaiters = [];
          if (ac) {
            const old = ac;
            ac = null; master = null;
            _setTimeout(() => { try { old.close(); } catch (_) {} }, 160);
          }
          Object.assign(settings, { preset: "ambient", tempo: 70, volume: 0.5, intensity: 0.5, density: 0.5, swing: 0, filterCutoff: null, scale: "major", scaleFreqs: null, root: 220, transpose: 0, pattern: DEFAULT_PATTERN.slice(), wave: "sine" });
          log("music", "music torn down (" + reason + ")");
        },
        snapshot() { return { state: stateName(), playing: !!(bed && bed.started && !pausedByBit), preset: settings.preset, contextState: ac ? ac.state : "none", volume: settings.volume, intensity: settings.intensity }; }
      };
    }

    // ---- ctx.audio: minimal data:/blob: playback ----
    function makeAudio(life) {
      const make = (url, opts, loop) => {
        if (!hasPerm("audio")) {
          log("error", "ctx.audio." + (loop ? "loop" : "play") + " without the \"audio\" permission → NotAllowedError");
          throw notAllowed("ctx.audio requires the \"audio\" permission in manifest.permissions");
        }
        if (!/^(data:|blob:|about:)/i.test(String(url))) throw new TypeError("ctx.audio: only local data:/blob:/about: URLs are allowed (got " + String(url).slice(0, 60) + ")");
        const el = new _Audio(String(url));
        el.loop = !!loop;
        el.volume = clamp(isNum(opts && opts.volume) ? opts.volume : 1, 0, 1);
        if (H.muted) el.muted = true;
        life.audioEls.add(el);
        el.play().catch(() => {});
        log("music", "audio." + (loop ? "loop" : "play") + "(" + String(url).slice(0, 40) + "…)");
        return {
          stop() { el.pause(); el.currentTime = 0; },
          pause() { el.pause(); },
          resume() { el.play().catch(() => {}); },
          get paused() { return el.paused; },
          get volume() { return el.volume; },
          set volume(v) { el.volume = clamp(Number(v) || 0, 0, 1); }
        };
      };
      return {
        play(url, opts) { return make(url, opts, false); },
        loop(url, opts) { return make(url, opts, true); },
        stopAll() { for (const el of life.audioEls) { el.pause(); el.currentTime = 0; } log("music", "audio.stopAll()"); },
        reactive: {
          start() { return Promise.reject(hasPerm("microphone") ? hostError("microphone_unavailable", "Microphone analysis is not available in the harness", { name: "NotSupportedError" }) : notAllowed("ctx.audio.reactive requires the \"microphone\" permission")); },
          stop() {}
        }
      };
    }

    // ---------------------------------------------------------------------------------------------
    // ctx.fx: bounded, cleanup-owned feedback on an input-passthrough overlay canvas
    // ---------------------------------------------------------------------------------------------
    const FX_CAP = 48;
    const reducedMotion = () => { try { return win.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    function makeFxRoot(life) {
      // One scheduler per lifetime; contexts (default + ctx.fx.create children) share its cap.
      const root = { time: 0, effects: new Set(), contexts: new Set(), dirty: false };
      root._tick = function (dt) {
        if (H.hostPaused) return;
        root.time += Math.min(dt, 100);
        for (const c of root.contexts) c._draw(root.time);
      };
      root._resize = function () { for (const c of root.contexts) c._resize(); };
      return root;
    }

    function makeFxContext(life, placement) {
      if (!life.fxRoot) life.fxRoot = makeFxRoot(life);
      const root = life.fxRoot;
      let canvas = null, g = null, scale = 1, drewLastFrame = false;
      const effects = new Set();
      const trails = new Set();
      const ctxApi = {};
      root.contexts.add(ctxApi);

      function ensureCanvas() {
        if (canvas) return;
        canvas = doc.createElement("canvas");
        canvas.__harnessOwned = true;
        canvas.setAttribute("data-harness", "fx-overlay");
        canvas.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;display:block;";
        const layer = placement && placement.layer && LANES[placement.layer] ? placement.layer : "overlay";
        const order = placement && isNum(placement.order) ? clamp(placement.order, -LANE_SPAN, LANE_SPAN) : 90;
        canvas.style.zIndex = String(LANES[layer] + order);
        g = canvas.getContext("2d");
        container.appendChild(canvas);
        life.surfaces.set(canvas, { kind: "fx", placement: { layer, order, zIndex: null, input: "passthrough" } });
        ctxApi._resize();
        ensureTicking();
      }
      ctxApi._resize = function () {
        if (!canvas) return;
        scale = Math.min(currentDpr(), 2);
        canvas.width = Math.max(1, Math.round(H.env.width * scale));
        canvas.height = Math.max(1, Math.round(H.env.height * scale));
        g.setTransform(scale, 0, 0, scale, 0, 0);
      };
      ctxApi._draw = function (t) {
        if (!canvas) return;
        if (!effects.size && !trails.size) {
          if (drewLastFrame) { g.clearRect(0, 0, H.env.width, H.env.height); drewLastFrame = false; }
          return;
        }
        g.clearRect(0, 0, H.env.width, H.env.height);
        drewLastFrame = true;
        for (const e of Array.from(effects)) {
          if (e.state === "paused") { e.draw(g, e.pausedProgress); continue; }
          const p = (t - e.start) / e.duration;
          if (p >= 1) { end(e, "finished"); continue; }
          g.save();
          try { e.draw(g, Math.max(0, p)); } catch (err) { reportError(err, "fx draw"); end(e, "error"); }
          g.restore();
        }
        for (const tr of Array.from(trails)) tr._draw(g, t);
      };
      function end(e, why) {
        if (e.state === "done") return;
        e.state = "done";
        effects.delete(e);
        root.effects.delete(e);
        e.resolve();
        if (why === "cancelled" || why === "capped") log("fx", "fx." + e.kind + " " + why);
      }
      function addEffect(kind, opts, draw, defaultMs) {
        if (isDead(life, "ctx.fx." + kind)) return deadHandle();
        ensureCanvas();
        const o = opts || {};
        const raw = isNum(o.durationMs) ? o.durationMs : (isNum(o.duration) ? o.duration : defaultMs);
        const e = { kind, start: root.time, duration: clamp(raw, 16, 5000), draw, state: "active", pausedProgress: 0 };
        e.done = new Promise((r) => { e.resolve = r; });
        if (root.effects.size >= FX_CAP) {
          const oldest = root.effects.values().next().value;
          if (oldest && oldest.owner) oldest.owner(oldest, "capped");
        }
        e.owner = end;
        effects.add(e);
        root.effects.add(e);
        log("fx", "fx." + kind, summarizeFx(o));
        return fxHandle(e, end);
      }
      function fxHandle(e, endFn) {
        return {
          get active() { return e.state === "active" || e.state === "paused"; },
          cancel() { if (e.state === "done") return false; endFn(e, "cancelled"); return true; },
          finish() { if (e.state === "done") return false; endFn(e, "finished"); return true; },
          pause() { if (e.state !== "active") return false; e.state = "paused"; e.pausedProgress = clamp((root.time - e.start) / e.duration, 0, 1); return true; },
          resume() { if (e.state !== "paused") return false; e.start = root.time - e.pausedProgress * e.duration; e.state = "active"; return true; },
          done: e.done
        };
      }
      function pos(o) {
        const cr = container.getBoundingClientRect();
        const W = H.env.width, Hh = H.env.height;
        if (!o) return { x: W / 2, y: Hh / 2 };
        const target = o.anchor || o.target;
        if (target && target.nodeType === 1) {
          const r = target.getBoundingClientRect();
          return { x: r.left + r.width / 2 - cr.left, y: r.top + r.height / 2 - cr.top };
        }
        const src = o.pointer || o;
        if (isNum(src.clientX) && isNum(src.clientY) && src.pointerType !== undefined) return { x: src.clientX - cr.left, y: src.clientY - cr.top };
        if (isNum(src.x) && isNum(src.y)) return { x: src.x, y: src.y };
        if (isNum(src.normalizedX) && isNum(src.normalizedY)) return { x: src.normalizedX * W, y: src.normalizedY * Hh };
        if (isNum(src.ndcX) && isNum(src.ndcY)) return { x: (src.ndcX + 1) / 2 * W, y: (1 - src.ndcY) / 2 * Hh };
        return { x: W / 2, y: Hh / 2 };
      }
      const colorOf = (o, fallback) => (o && typeof o.color === "string" ? o.color : fallback || "#ffffff");
      function dots(n, seed) {
        const rnd = mulberry32(seed);
        return Array.from({ length: n }, () => ({ a: rnd() * Math.PI * 2, s: 0.55 + rnd() * 0.45, r: 2 + rnd() * 2.5 }));
      }
      Object.assign(ctxApi, {
        ripple(o) {
          const p = pos(o), c = colorOf(o), R = isNum(o && o.radius) ? o.radius : 48, w = isNum(o && (o.width ?? o.lineWidth)) ? (o.width ?? o.lineWidth) : 3;
          return addEffect("ripple", o, (gx, t) => { gx.globalAlpha = 1 - t; gx.strokeStyle = c; gx.lineWidth = Math.max(0.5, w * (1 - t * 0.6)); gx.beginPath(); gx.arc(p.x, p.y, R * easeOut(t), 0, Math.PI * 2); gx.stroke(); }, 420);
        },
        burst(o) {
          const p = pos(o), c = colorOf(o), n = clamp(Math.round(isNum(o && o.count) ? o.count : 10), 1, 64), spread = isNum(o && (o.spread ?? o.radius)) ? (o.spread ?? o.radius) : 60, pts = dots(n, hashString(p.x + ":" + p.y + ":" + root.time));
          return addEffect("burst", o, (gx, t) => { gx.fillStyle = c; gx.globalAlpha = 1 - t; for (const d of pts) { const r = spread * d.s * easeOut(t); gx.beginPath(); gx.arc(p.x + Math.cos(d.a) * r, p.y + Math.sin(d.a) * r, d.r * (1 - t * 0.7), 0, Math.PI * 2); gx.fill(); } }, 520);
        },
        impact(o) {
          const p = pos(o), c = colorOf(o), k = clamp(isNum(o && o.strength) ? o.strength : 1, 0.1, 3), R = (isNum(o && o.radius) ? o.radius : 40) * k, n = clamp(Math.round(isNum(o && o.count) ? o.count : 8), 1, 48), pts = dots(n, hashString("i" + p.x + ":" + p.y + ":" + root.time));
          return addEffect("impact", o, (gx, t) => {
            gx.globalAlpha = 1 - t; gx.strokeStyle = c; gx.lineWidth = 3 * k * (1 - t); gx.beginPath(); gx.arc(p.x, p.y, R * easeOut(t), 0, Math.PI * 2); gx.stroke();
            gx.fillStyle = c; for (const d of pts) { const r = R * 1.25 * d.s * easeOut(t); gx.beginPath(); gx.arc(p.x + Math.cos(d.a) * r, p.y + Math.sin(d.a) * r, d.r * (1 - t), 0, Math.PI * 2); gx.fill(); }
            if (t < 0.25) { gx.globalAlpha = (0.25 - t) * 2; gx.beginPath(); gx.arc(p.x, p.y, R * 0.35, 0, Math.PI * 2); gx.fill(); }
          }, 460);
        },
        flash(o) {
          const c = colorOf(o), op = clamp(isNum(o && o.opacity) ? o.opacity : 0.35, 0, 1), blend = o && typeof o.blend === "string" ? o.blend : null;
          return addEffect("flash", o, (gx, t) => { if (blend) gx.globalCompositeOperation = blend; gx.globalAlpha = op * (1 - easeOut(t)); gx.fillStyle = c; gx.fillRect(0, 0, H.env.width, H.env.height); }, 180);
        },
        floatText(o) {
          const p = pos(o), c = colorOf(o), text = String(o && o.text != null ? o.text : "+1").slice(0, 96), size = clamp(isNum(o && o.size) ? o.size : 18, 10, 48), rise = clamp(isNum(o && o.rise) ? o.rise : 36, 4, 120);
          let offset = 0;
          if (!(o && o.stack === "none")) for (const e of effects) if (e.kind === "floatText" && Math.abs(e.x - p.x) < 40 && Math.abs(e.y - p.y) < 30) offset += size * 0.9;
          const h = addEffect("floatText", o, (gx, t) => { gx.globalAlpha = 1 - t * t; gx.fillStyle = c; gx.font = "700 " + size + "px system-ui, -apple-system, sans-serif"; gx.textAlign = "center"; gx.textBaseline = "middle"; gx.fillText(text, p.x, p.y - offset - rise * easeOut(t)); }, 760);
          for (const e of effects) if (e.kind === "floatText" && e.x === undefined) { e.x = p.x; e.y = p.y; }
          return h;
        },
        pulse(target, o) {
          const opts = o || {};
          let el = null;
          try { el = resolveSurface(target, "ctx.fx.pulse"); } catch (_) { el = null; }
          const s = clamp(isNum(opts.scale) ? opts.scale : 1.08, 1.01, 1.5);
          return animateEl("pulse", el, [{ transform: "scale(1)" }, { transform: "scale(" + (reducedMotion() ? 1 + (s - 1) / 3 : s) + ")" }, { transform: "scale(1)" }], clamp(isNum(opts.durationMs) ? opts.durationMs : (isNum(opts.duration) ? opts.duration : 180), 16, 5000), opts);
        },
        shake(target, o) {
          let el = container;
          let opts = o || {};
          if (target && target.nodeType === 1) el = target;
          else if (target && typeof target === "object" && !o) {
            try { el = resolveSurface(target, "ctx.fx.shake"); } catch (_) { opts = target; el = container; }
          }
          const amount = clamp(isNum(opts.amount) ? opts.amount : 8, 1, 48) * (reducedMotion() ? 0.25 : 1);
          const freq = clamp(isNum(opts.frequency) ? opts.frequency : 18, 1, 60);
          const dur = clamp(isNum(opts.durationMs) ? opts.durationMs : (isNum(opts.duration) ? opts.duration : 320), 16, 5000);
          const axis = opts.axis === "y" ? "Y" : "X";
          const n = Math.max(2, Math.round((dur / 1000) * freq * 2));
          const frames = [];
          for (let i = 0; i <= n; i++) {
            const decay = 1 - i / n;
            const v = i === 0 || i === n ? 0 : (i % 2 ? 1 : -1) * amount * decay;
            frames.push({ transform: "translate" + axis + "(" + v.toFixed(2) + "px)" });
          }
          return animateEl("shake", el, frames, dur, opts);
        },
        trail(inputOrOptions, options) {
          if (isDead(life, "ctx.fx.trail")) return { add() { return false; }, follow() { return false; }, pause() {}, resume() {}, clear() {}, destroy() {} };
          ensureCanvas();
          const looksLikeInput = inputOrOptions && (typeof inputOrOptions.frameDone === "function" || isNum(inputOrOptions.clientX));
          const o = Object.assign({}, looksLikeInput ? {} : inputOrOptions || {}, options || {});
          const lifeMs = clamp(isNum(o.lifeMs) ? o.lifeMs : (isNum(o.maxAge) ? o.maxAge : 360), 80, 2000);
          const width = clamp(isNum(o.width) ? o.width : 3, 1, 24);
          const spacing = clamp(isNum(o.spacing) ? o.spacing : 1, 1, 48);
          const color = colorOf(o);
          let pts = [], paused = false, destroyed = false;
          const tr = {
            add(point) {
              if (destroyed || paused || !point) return false;
              const p = isNum(point.clientX) && point.pointerType !== undefined ? pos(point) : { x: point.x, y: point.y };
              if (!isNum(p.x) || !isNum(p.y)) return false;
              const last = pts[pts.length - 1];
              if (last && Math.hypot(last.x - p.x, last.y - p.y) < spacing) return false;
              pts.push({ x: p.x, y: p.y, t: root.time });
              if (pts.length > 256) pts.shift();
              trails.add(tr);
              return true;
            },
            follow(input) {
              const src = input && typeof input.frameDone === "function" ? input.primary : input;
              return tr.add(src);
            },
            pause() { paused = true; },
            resume() { paused = false; },
            clear() { pts = []; },
            destroy() { destroyed = true; pts = []; trails.delete(tr); },
            _draw(gx, t) {
              pts = pts.filter((p) => t - p.t <= lifeMs);
              if (pts.length < 2) { if (!pts.length) trails.delete(tr); return; }
              gx.save();
              gx.strokeStyle = color; gx.lineCap = "round"; gx.lineJoin = "round";
              for (let i = 1; i < pts.length; i++) {
                const a = pts[i - 1], b = pts[i];
                const k = 1 - (t - b.t) / lifeMs;
                gx.globalAlpha = clamp(k, 0, 1);
                gx.lineWidth = width * clamp(k, 0.2, 1);
                gx.beginPath(); gx.moveTo(a.x, a.y); gx.lineTo(b.x, b.y); gx.stroke();
              }
              gx.restore();
            }
          };
          own(life, () => tr.destroy(), "fx trail");
          return tr;
        },
        transition(o) { return makeTransition(life, o); },
        clear() {
          for (const e of Array.from(effects)) end(e, "cancelled");
          for (const tr of Array.from(trails)) tr.clear();
        },
        create(opts) {
          return guard(makeFxContext(life, opts || {}), "fx.create(...)", "fx");
        }
      });
      function animateEl(kind, el, frames, dur, opts) {
        if (isDead(life, "ctx.fx." + kind)) return deadHandle();
        let resolveDone;
        const done = new Promise((r) => { resolveDone = r; });
        if (!el || typeof el.animate !== "function") {
          log("fx", "fx." + kind + " (no animatable target; settled immediately)");
          resolveDone();
          return { get active() { return false; }, cancel() { return false; }, finish() { return false; }, pause() { return false; }, resume() { return false; }, done };
        }
        let anim;
        try { anim = el.animate(frames, { duration: dur, easing: kind === "pulse" ? "ease-out" : "linear", composite: "add" }); }
        catch (_) { anim = el.animate(frames, { duration: dur }); }
        life.animations.add(anim);
        let state = "active";
        const settle = () => { state = "done"; life.animations.delete(anim); resolveDone(); };
        anim.finished.then(settle, settle);
        log("fx", "fx." + kind, Object.assign({ target: el }, summarizeFx(opts)));
        return {
          get active() { return state !== "done"; },
          cancel() { if (state === "done") return false; anim.cancel(); return true; },
          finish() { if (state === "done") return false; anim.finish(); return true; },
          pause() { if (state !== "active") return false; anim.pause(); state = "paused"; return true; },
          resume() { if (state !== "paused") return false; anim.play(); state = "active"; return true; },
          done
        };
      }
      return ctxApi;
    }
    function deadHandle() {
      return { get active() { return false; }, cancel() { return false; }, finish() { return false; }, pause() { return false; }, resume() { return false; }, done: Promise.resolve() };
    }
    function summarizeFx(o) {
      if (!o || typeof o !== "object") return undefined;
      const s = {};
      for (const k of ["x", "y", "color", "text", "durationMs", "radius", "count", "opacity", "kind", "amount", "scale"]) if (o[k] !== undefined) s[k] = typeof o[k] === "number" ? Math.round(o[k] * 10) / 10 : o[k];
      return Object.keys(s).length ? s : undefined;
    }

    function makeTransition(life, opts) {
      if (life.transition) life.transition._supersede();
      const o = opts || {};
      const kind = o.kind === "wipe" || o.kind === "iris" ? o.kind : "fade";
      const color = typeof o.color === "string" ? o.color : "#000";
      const outMs = clamp(isNum(o.outMs) ? o.outMs : 160, 16, 5000);
      const inMs = clamp(isNum(o.inMs) ? o.inMs : 180, 16, 5000);
      const dir = ["left", "right", "up", "down"].indexOf(o.direction) >= 0 ? o.direction : "left";
      const el = doc.createElement("div");
      el.__harnessOwned = true;
      el.setAttribute("data-harness", "fx-transition");
      el.style.cssText = "position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:" + (LANES.modal + LANE_SPAN) + ";";
      let hole = null;
      if (kind === "iris") {
        el.style.overflow = "hidden";
        hole = doc.createElement("div");
        const d = Math.hypot(H.env.width, H.env.height) * 1.1;
        hole.style.cssText = "position:absolute;left:50%;top:50%;width:" + d + "px;height:" + d + "px;margin:" + (-d / 2) + "px 0 0 " + (-d / 2) + "px;border-radius:50%;box-shadow:0 0 0 " + (d * 2) + "px " + color + ";";
        el.appendChild(hole);
      } else {
        el.style.background = color;
        el.style.opacity = kind === "fade" ? "0" : "1";
        if (kind === "wipe") el.style.clipPath = wipeClip(dir, "hidden-start");
      }
      container.appendChild(el);
      let state = "idle"; // idle → covering → covered → revealing → done
      let anim = null;
      let coverPromise = null;
      let resolveDone;
      const done = new Promise((r) => { resolveDone = r; });
      const waiters = [];
      function wipeClip(d, phase) {
        // phase: hidden-start (nothing covered), full, hidden-end (uncovered past the far edge)
        if (phase === "full") return "inset(0 0 0 0)";
        const map = { left: ["inset(0 0 0 100%)", "inset(0 100% 0 0)"], right: ["inset(0 100% 0 0)", "inset(0 0 0 100%)"], up: ["inset(100% 0 0 0)", "inset(0 0 100% 0)"], down: ["inset(0 0 100% 0)", "inset(100% 0 0 0)"] };
        return phase === "hidden-start" ? map[d][0] : map[d][1];
      }
      function run(frames, ms) {
        return new Promise((resolve) => {
          const target = kind === "iris" ? hole : el;
          anim = target.animate(frames, { duration: ms, easing: "ease-in-out", fill: "forwards" });
          life.animations.add(anim);
          const fin = () => { life.animations.delete(anim); resolve(); };
          anim.finished.then(fin, fin);
          waiters.push(resolve);
        });
      }
      function cleanupEl() { if (el.parentNode) el.remove(); }
      function settleAll() {
        state = "done";
        if (anim) { try { anim.cancel(); } catch (_) {} }
        cleanupEl();
        for (const w of waiters.splice(0)) w();
        resolveDone();
        if (life.transition === tr) life.transition = null;
      }
      const tr = {
        get active() { return state !== "done"; },
        cover() {
          if (state === "done") return Promise.resolve();
          if (coverPromise) return coverPromise;
          state = "covering";
          log("fx", "fx.transition(" + kind + ").cover " + outMs + "ms");
          const frames = kind === "fade" ? [{ opacity: 0 }, { opacity: 1 }] : kind === "wipe" ? [{ clipPath: wipeClip(dir, "hidden-start") }, { clipPath: "inset(0 0 0 0)" }] : [{ transform: "scale(1)" }, { transform: "scale(0)" }];
          coverPromise = run(frames, outMs).then(() => { if (state === "covering") state = "covered"; });
          return coverPromise;
        },
        reveal() {
          if (state === "done") return Promise.resolve();
          const go = () => {
            if (state === "done") return Promise.resolve();
            state = "revealing";
            log("fx", "fx.transition(" + kind + ").reveal " + inMs + "ms");
            const frames = kind === "fade" ? [{ opacity: 1 }, { opacity: 0 }] : kind === "wipe" ? [{ clipPath: "inset(0 0 0 0)" }, { clipPath: wipeClip(dir, "hidden-end") }] : [{ transform: "scale(0)" }, { transform: "scale(1)" }];
            return run(frames, inMs).then(() => { if (state !== "done") settleAll(); });
          };
          return (coverPromise || tr.cover()).then(go);
        },
        cancel() { if (state === "done") return false; log("fx", "fx.transition cancelled"); settleAll(); return true; },
        finish() { if (state === "done") return false; settleAll(); return true; },
        pause() { if (!anim || state === "done") return false; anim.pause(); return true; },
        resume() { if (!anim || state === "done") return false; anim.play(); return true; },
        done,
        _supersede() { if (state !== "done") { log("fx", "fx.transition superseded by a newer transition"); settleAll(); } },
        _kill() { if (state !== "done") settleAll(); }
      };
      life.transition = tr;
      return tr;
    }

    // ---------------------------------------------------------------------------------------------
    // ctx.tune: manifest.tuning defaults plus draft-time edits from the side panel
    // ---------------------------------------------------------------------------------------------
    function normalizeKnob(decl, raw) {
      const type = decl.type;
      const min = isNum(decl.min) ? decl.min : -Infinity;
      const max = isNum(decl.max) ? decl.max : Infinity;
      const opts = Array.isArray(decl.options) ? decl.options : [];
      const num = (v, fb) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };
      switch (type) {
        case "number": return clamp(num(raw, num(decl.default, 0)), min, max);
        case "integer": return Math.round(clamp(num(raw, num(decl.default, 0)), min, max));
        case "duration_ms": return clamp(num(raw, num(decl.default, 0)), Math.max(0, min), max);
        case "percent": return clamp(num(raw, num(decl.default, 0)), isNum(decl.min) ? decl.min : 0, isNum(decl.max) ? decl.max : 1);
        case "boolean": return raw === true || raw === "true" || raw === 1;
        case "choice": return opts.indexOf(raw) >= 0 ? raw : (opts.indexOf(decl.default) >= 0 ? decl.default : opts[0]);
        case "multi_choice": return Array.isArray(raw) ? raw.filter((v, i) => opts.indexOf(v) >= 0 && raw.indexOf(v) === i) : [];
        case "color": return typeof raw === "string" && raw ? raw : String(decl.default || "#ffffff");
        case "range": {
          const a = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? [raw.min, raw.max] : decl.default);
          const lo = clamp(num(a && a[0], min === -Infinity ? 0 : min), min, max), hi = clamp(num(a && a[1], max === Infinity ? 1 : max), min, max);
          return [Math.min(lo, hi), Math.max(lo, hi)];
        }
        case "point2":
        case "vec2": {
          const v = Array.isArray(raw) ? { x: raw[0], y: raw[1] } : (raw || {});
          return { x: clamp(num(v.x, 0), min, max), y: clamp(num(v.y, 0), min, max) };
        }
        case "seed": return typeof raw === "number" || typeof raw === "string" ? raw : decl.default;
        default: return clone(raw);
      }
    }
    function normalizePoints(points) {
      const list = Array.isArray(points) ? points : [];
      return list.map((p) => (Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]) } : { x: Number(p.x), y: Number(p.y) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        .sort((a, b) => a.x - b.x);
    }
    function curveEase(name, t) {
      switch (name) {
        case "smooth": return t * t * (3 - 2 * t);
        case "step": case "hold": return t < 1 ? 0 : 1;
        case "ease_in": return t * t;
        case "ease_out": return 1 - (1 - t) * (1 - t);
        case "ease_in_out": return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        default: return t;
      }
    }
    function evalPoints(points, easing, x) {
      if (!points.length) return 0;
      if (x <= points[0].x) return points[0].y;
      const last = points[points.length - 1];
      if (x >= last.x) return last.y;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (x <= b.x) {
          const t = b.x === a.x ? 1 : (x - a.x) / (b.x - a.x);
          return a.y + (b.y - a.y) * curveEase(easing, t);
        }
      }
      return last.y;
    }
    function createTuneStore() {
      const tuning = H.manifest.tuning || {};
      const knobs = tuning.knobs || {};
      const curves = tuning.curves || {};
      const presets = tuning.presets || {};
      const values = {};
      const points = {};
      for (const id of Object.keys(knobs)) values[id] = normalizeKnob(knobs[id], knobs[id].default);
      for (const id of Object.keys(curves)) points[id] = normalizePoints(curves[id].default);
      let revision = 0;
      const subs = new Set();
      function notify(id) {
        const value = hasOwn(values, id) ? clone(values[id]) : clone(points[id]);
        for (const s of Array.from(subs)) {
          if (s.ids && s.ids.indexOf(id) < 0) continue;
          guardCall(s.fn, "ctx.tune.onChange callback", [value, { id, revision }]);
        }
      }
      function set(id, raw, source) {
        if (hasOwn(knobs, id)) {
          const next = normalizeKnob(knobs[id], raw);
          if (JSON.stringify(next) === JSON.stringify(values[id])) return false;
          values[id] = next;
        } else if (hasOwn(curves, id)) {
          const next = normalizePoints(raw);
          if (JSON.stringify(next) === JSON.stringify(points[id])) return false;
          points[id] = next;
        } else return false;
        revision++;
        log("tune", "tune " + id + " = " + safeJson(hasOwn(values, id) ? values[id] : points[id], 120) + " (" + source + ", revision " + revision + ")");
        notify(id);
        return true;
      }
      return {
        knobs, curves, presets, values, points,
        get revision() { return revision; },
        set,
        subscribe(ids, fn) { const s = { ids, fn }; subs.add(s); return () => subs.delete(s); },
        reset(id, source) {
          const changed = [];
          const ids = id != null ? [id] : Object.keys(knobs).concat(Object.keys(curves));
          for (const k of ids) {
            if (hasOwn(knobs, k) && set(k, knobs[k].default, source || "reset")) changed.push(k);
            else if (hasOwn(curves, k) && set(k, curves[k].default, source || "reset")) changed.push(k);
          }
          return changed;
        },
        applyPreset(id, source) {
          if (!hasOwn(presets, id)) return [];
          const vals = presets[id].values || {};
          const changed = [];
          for (const k of Object.keys(vals)) if (set(k, vals[k], source || "preset " + id)) changed.push(k);
          return changed;
        },
        snapshot() {
          const out = {};
          for (const k of Object.keys(values)) out[k] = clone(values[k]);
          for (const k of Object.keys(points)) out[k] = clone(points[k]);
          return out;
        }
      };
    }
    function makeTune(life) {
      const T = () => H.tune;
      const typed = (getterName, check) => function (id) {
        const t = T();
        if (!hasOwn(t.knobs, id)) {
          warnOnce("tune-undeclared:" + id, "ctx.tune." + getterName + "(\"" + id + "\"): not declared in manifest.tuning.knobs → undefined");
          return undefined;
        }
        const v = t.values[id];
        if (check && !check(v, t.knobs[id].type)) {
          warnOnce("tune-type:" + getterName + ":" + id, "ctx.tune." + getterName + "(\"" + id + "\") on a \"" + t.knobs[id].type + "\" knob → undefined");
          return undefined;
        }
        return clone(v);
      };
      const isNumber = (v) => isNum(v);
      return {
        get(id) { const t = T(); if (hasOwn(t.knobs, id)) return clone(t.values[id]); if (hasOwn(t.curves, id)) return clone(t.points[id]); return undefined; },
        number: typed("number", isNumber),
        integer: (id) => { const v = typed("integer", isNumber)(id); return v === undefined ? undefined : Math.round(v); },
        boolean: typed("boolean", (v) => typeof v === "boolean"),
        choice: typed("choice", (v, type) => type === "choice" || typeof v === "string"),
        multiChoice: typed("multiChoice", (v) => Array.isArray(v)),
        color: typed("color", (v) => typeof v === "string"),
        range: typed("range", (v) => Array.isArray(v)),
        point2: typed("point2", (v) => v && typeof v === "object" && isNum(v.x)),
        vec2: typed("vec2", (v) => v && typeof v === "object" && isNum(v.x)),
        seed: typed("seed", (v) => typeof v === "string" || typeof v === "number"),
        durationMs: typed("durationMs", isNumber),
        percent: typed("percent", isNumber),
        curve(id) {
          const t = T();
          if (!hasOwn(t.curves, id)) {
            warnOnce("tune-curve:" + id, "ctx.tune.curve(\"" + id + "\"): not declared in manifest.tuning.curves → empty evaluator (at() returns 0)");
            const empty = { id, domain: null, range: null, points: [], easing: "linear", at: () => 0, toJSON: () => ({ id, domain: null, range: null, points: [], easing: "linear" }) };
            return Object.freeze(empty);
          }
          const decl = t.curves[id];
          const pts = clone(t.points[id]);
          const easing = decl.easing || "linear";
          const json = { id, domain: decl.domain, range: clone(decl.range), points: clone(pts), easing };
          return Object.freeze({ id, domain: decl.domain, range: Object.freeze(clone(decl.range)), points: Object.freeze(pts.map((p) => Object.freeze(p))), easing, at: (x) => evalPoints(pts, easing, Number(x)), toJSON: () => clone(json) });
        },
        onChange(idOrIds, fn) {
          if (typeof fn !== "function") throw new TypeError("ctx.tune.onChange(idOrIds, fn) needs a function");
          if (isDead(life, "ctx.tune.onChange")) return function () {};
          const ids = idOrIds == null ? null : (Array.isArray(idOrIds) ? idOrIds.map(String) : [String(idOrIds)]);
          const off = T().subscribe(ids, fn);
          return own(life, off, "tune listener");
        },
        has(id) { const t = T(); return hasOwn(t.knobs, id) || hasOwn(t.curves, id); },
        snapshot() { return T().snapshot(); },
        meta(id) {
          const t = T();
          if (hasOwn(t.knobs, id)) return Object.assign({ id, kind: "knob" }, clone(t.knobs[id]));
          if (hasOwn(t.curves, id)) return Object.assign({ id, kind: "curve" }, clone(t.curves[id]));
          return undefined;
        },
        applyPreset(id) { const changed = T().applyPreset(id, "ctx.tune.applyPreset"); shell.tuneChanged(); return changed; },
        reset(id) { const changed = T().reset(id, "ctx.tune.reset"); shell.tuneChanged(); return changed; }
      };
    }

    // ---------------------------------------------------------------------------------------------
    // ctx.onboarding: inert for immersive; minimal host overlay for one_line / guided / briefing
    // ---------------------------------------------------------------------------------------------
    function createOnboarding() {
      const decl = H.manifest.onboarding || {};
      const kind = ["immersive", "one_line", "guided", "briefing"].indexOf(decl.kind) >= 0 ? decl.kind : "immersive";
      const version = Number.isInteger(decl.version) && decl.version > 0 ? decl.version : 1;
      const replayable = decl.replayable === true;
      const items = kind === "guided" ? (decl.steps || []) : kind === "briefing" ? (decl.pages || []) : kind === "one_line" ? [{ id: null, body: decl.message || "" }] : [];
      const key = storageKey("onboarding:" + kind + ":v" + version);
      const st = { active: false, completed: !!readJson(key, false), index: -1, focus: null };
      const managed = kind !== "immersive";
      function snapshot() {
        return Object.freeze({ kind, version, active: st.active, completed: st.completed, currentIndex: st.index, currentStepId: st.active && items[st.index] && items[st.index].id ? items[st.index].id : null, replayable });
      }
      function render() {
        try {
          shell.onboarding(st.active ? JSON.stringify({ kind, index: st.index, count: items.length, item: items[st.index] || null, focus: st.focus }) : null);
        } catch (_) {}
      }
      function activate(from) {
        st.active = true; st.index = 0; st.focus = null;
        log("onboarding", "onboarding " + kind + " v" + version + " shown (" + from + ")");
        render();
        return true;
      }
      function close(how) {
        if (!st.active) return false;
        st.active = false; st.index = -1; st.focus = null;
        st.completed = true;
        writeJson(key, true);
        log("onboarding", "onboarding " + how + " (completion saved for this device)");
        render();
        return true;
      }
      return {
        managed,
        api: {
          state() { return snapshot(); },
          start(o) { log("onboarding", "onboarding.start(" + safeJson(o || {}, 40) + ")"); if (!managed || st.active) return false; if (st.completed && !(o && o.force)) return false; return activate("start"); },
          next() { log("onboarding", "onboarding.next()"); if (!st.active) return false; if (st.index + 1 >= items.length) return close("completed"); st.index++; render(); return true; },
          advance(stepId) {
            log("onboarding", "onboarding.advance(" + (stepId == null ? "" : "\"" + stepId + "\"") + ")");
            if (!st.active) return false;
            const cur = items[st.index];
            if (stepId != null && (!cur || cur.id !== stepId)) return false;
            if (st.index + 1 >= items.length) return close("completed");
            st.index++; render(); return true;
          },
          complete() { log("onboarding", "onboarding.complete()"); return close("completed"); },
          dismiss() { log("onboarding", "onboarding.dismiss()"); return close("dismissed"); },
          focus(t) {
            log("onboarding", "onboarding.focus()");
            if (!st.active) return false;
            let rect = null;
            if (t && t.nodeType === 1) { const r = t.getBoundingClientRect(), c = container.getBoundingClientRect(); rect = { x: r.left - c.left, y: r.top - c.top, width: r.width, height: r.height }; }
            else if (t && isNum(t.x) && isNum(t.y) && t.width > 0 && t.height > 0) rect = { x: t.x, y: t.y, width: t.width, height: t.height };
            if (!rect || !(rect.width > 0 && rect.height > 0)) return false;
            st.focus = rect; render(); return true;
          },
          clearFocus() { log("onboarding", "onboarding.clearFocus()"); if (!st.focus) return false; st.focus = null; render(); return true; },
          replay() { log("onboarding", "onboarding.replay()"); if (!managed || !replayable || st.active) return false; return activate("replay"); }
        },
        autoStart() { if (managed && !st.completed && !st.active) activate("first use"); },
        onInteract(source) {
          if (!st.active) return;
          if (kind === "one_line") close("cleared by first " + source);
          else if (kind === "guided" && items[st.index] && items[st.index].advance === "interaction") { if (st.index + 1 >= items.length) close("completed"); else { st.index++; render(); } }
        },
        hostAction(action) {
          if (action === "next") { if (st.index + 1 >= items.length) close("completed"); else { st.index++; render(); } }
          else if (action === "skip") close("skipped");
          else if (action === "confirm") close("confirmed");
        },
        onDestroy() { if (st.active) { st.active = false; st.index = -1; render(); } },
        clear() { try { win.localStorage.removeItem(key); } catch (_) {} st.completed = false; }
      };
    }

    // ---------------------------------------------------------------------------------------------
    // ctx.visual (palette/kit only), ctx.math, ctx.geometry
    // ---------------------------------------------------------------------------------------------
    const colorCanvas = doc.createElement("canvas").getContext("2d");
    function parseColor(input) {
      if (input && typeof input === "object" && isNum(input.r)) return { r: input.r, g: input.g, b: input.b, a: isNum(input.a) ? input.a : 1 };
      if (typeof input !== "string") return null;
      colorCanvas.fillStyle = "#010203";
      colorCanvas.fillStyle = input;
      const v = colorCanvas.fillStyle;
      if (v === "#010203" && input.trim().toLowerCase() !== "#010203") return null;
      if (v[0] === "#") return { r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16), a: 1 };
      const m = v.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(",").map((s) => parseFloat(s));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    const toHex = (c) => "#" + [c.r, c.g, c.b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
    const toCss = (c) => (c.a >= 1 ? toHex(c) : "rgba(" + Math.round(c.r) + ", " + Math.round(c.g) + ", " + Math.round(c.b) + ", " + Math.round(c.a * 1000) / 1000 + ")");
    function hslToRgb(h, s, l, a) {
      h = ((h % 360) + 360) % 360; s = clamp(s, 0, 100) / 100; l = clamp(l, 0, 100) / 100;
      const k = (n) => (n + h / 30) % 12;
      const f = (n) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a: isNum(a) ? clamp(a, 0, 1) : 1 };
    }
    function rgbToHsl(c) {
      const r = c.r / 255, g = c.g / 255, b = c.b / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      let h = 0, s = 0;
      const l = (mx + mn) / 2;
      if (mx !== mn) {
        const d = mx - mn;
        s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h *= 60;
      }
      return { h, s: s * 100, l: l * 100 };
    }
    function luminance(c) {
      const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
    }
    function contrastRatio(a, b) {
      const ca = parseColor(a), cb = parseColor(b);
      if (!ca || !cb) return 1;
      const la = luminance(ca), lb = luminance(cb);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }
    function mixColors(a, b, t) {
      const ca = parseColor(a) || { r: 0, g: 0, b: 0, a: 1 }, cb = parseColor(b) || { r: 255, g: 255, b: 255, a: 1 };
      const k = clamp(Number(t) || 0, 0, 1);
      return toCss({ r: ca.r + (cb.r - ca.r) * k, g: ca.g + (cb.g - ca.g) * k, b: ca.b + (cb.b - ca.b) * k, a: ca.a + (cb.a - ca.a) * k });
    }
    const ROLE_NAMES = ["bg", "bg2", "surface", "surface2", "ink", "muted", "line", "accent", "accent2", "accent3", "focus", "success", "warning", "danger"];
    function buildPalette(input, options) {
      const o = Object.assign({}, typeof input === "object" && input && !isNum(input.r) ? input : {}, options || {});
      const light = o.mode === "light";
      let hue = 258;
      const asColor = typeof input === "string" ? parseColor(input) : null;
      if (asColor) hue = rgbToHsl(asColor).h;
      else if (typeof input === "string" || o.seed != null) hue = hashString(String(o.seed != null ? o.seed : input)) % 360;
      else if (o.seed == null) hue = hashString(H.manifest.title || "bit") % 360;
      const hs = (h, s, l) => toHex(hslToRgb(h, s, l));
      const roles = light ? {
        bg: hs(hue, 30, 97), bg2: hs(hue, 26, 93), surface: "#ffffff", surface2: hs(hue, 22, 95), ink: hs(hue, 30, 12), muted: hs(hue, 12, 40), line: hs(hue, 16, 84),
        accent: asColor ? toHex(asColor) : hs(hue, 70, 48), accent2: hs(hue + 150, 60, 40), accent3: hs(hue + 40, 80, 46), focus: hs(hue, 80, 55), success: "#1f9d55", warning: "#c77c02", danger: "#d64545"
      } : {
        bg: hs(hue, 28, 7), bg2: hs(hue, 24, 10), surface: hs(hue, 20, 14), surface2: hs(hue, 18, 19), ink: hs(hue, 30, 96), muted: hs(hue, 14, 70), line: hs(hue, 16, 26),
        accent: asColor ? toHex(asColor) : hs(hue, 80, 66), accent2: hs(hue + 150, 62, 58), accent3: hs(hue + 40, 90, 64), focus: hs(hue, 90, 74), success: "#34c77b", warning: "#f5b041", danger: "#ff5d6c"
      };
      for (const r of ROLE_NAMES) if (typeof o[r] === "string") roles[r] = o[r];
      const role = (v) => (hasOwn(roles, v) ? roles[v] : v);
      const pal = Object.assign({}, roles, {
        ramp(roleOrColor, steps, opts) { return paletteHelpers.ramp(role(roleOrColor && typeof roleOrColor === "object" ? roles[(roleOrColor.role) || "accent"] : roleOrColor || "accent"), steps, opts); },
        gradient(a, b, steps) { return paletteHelpers.gradient(role(a), role(b), steps); },
        contrast(fg, bg) { return contrastRatio(role(fg), role(bg)); },
        isReadable(fg, bg, op) { return contrastRatio(role(fg), role(bg)) >= ((op && op.minTextContrast) || 4.5); },
        ensureReadable(fg, bg, op) { return paletteHelpers.ensureReadable(role(fg), role(bg), op); },
        cssVars(prefix) { const p = prefix || "--bit"; const out = {}; for (const r of ROLE_NAMES) out[p + "-" + r] = roles[r]; return out; },
        toJSON() { return Object.assign({}, roles); }
      });
      return Object.freeze(pal);
    }
    const paletteHelpers = {
      ramp(input, steps, opts) {
        const base = parseColor(typeof input === "string" ? input : "#7c5cff") || parseColor("#7c5cff");
        const n = clamp(Math.round(isNum(steps) ? steps : 5), 1, 24);
        const spread = isNum(opts && opts.spread) ? opts.spread : 0.34;
        const hsl = rgbToHsl(base);
        return Array.from({ length: n }, (_, i) => toHex(hslToRgb(hsl.h, hsl.s, clamp(hsl.l + (n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * spread * 100), 3, 97))));
      },
      gradient(a, b, steps) {
        const n = clamp(Math.round(isNum(steps) ? steps : 5), 1, 32);
        return Array.from({ length: n }, (_, i) => mixColors(a, b, n === 1 ? 0 : i / (n - 1)));
      },
      contrast: contrastRatio,
      isReadable(fg, bg, o) { return contrastRatio(fg, bg) >= ((o && o.minTextContrast) || 4.5); },
      ensureReadable(fg, bg, o) {
        const need = (o && o.minTextContrast) || 4.5;
        if (contrastRatio(fg, bg) >= need) return fg;
        const bgc = parseColor(bg) || { r: 0, g: 0, b: 0, a: 1 };
        const target = luminance(bgc) > 0.4 ? "#000000" : "#ffffff";
        for (let k = 0.1; k <= 1.0001; k += 0.1) { const c = mixColors(fg, target, k); if (contrastRatio(c, bg) >= need) return c; }
        return target;
      },
      mix: mixColors,
      pair(base, o) { const c = parseColor(base) || parseColor("#7c5cff"); const hsl = rgbToHsl(c); const off = o && o.harmony === "analogous" ? 30 : o && o.harmony === "triadic" ? 120 : 180; return { a: toHex(c), b: toHex(hslToRgb(hsl.h + off, hsl.s, hsl.l)) }; },
      harmonize(color, base, o) { const c = parseColor(color), b = parseColor(base); if (!c || !b) return color; const hc = rgbToHsl(c), hb = rgbToHsl(b); const amt = isNum(o && o.amount) ? o.amount : 0.32; let d = hb.h - hc.h; if (d > 180) d -= 360; if (d < -180) d += 360; return toHex(hslToRgb(hc.h + d * amt, hc.s, hc.l)); }
    };
    function makeVisual() {
      const palette = Object.assign(function () { return buildPalette.apply(null, arguments); }, paletteHelpers, {
        from: (input, options) => buildPalette(input, options),
        roles: (input, options) => buildPalette(input, options)
      });
      return {
        palette: guard(palette, "visual.palette", "visual"),
        kit(input, options) {
          const o = typeof input === "string" ? Object.assign({ mood: input }, options || {}) : Object.assign({}, input || {}, options || {});
          const pal = buildPalette(o.seed != null ? String(o.seed) : (o.mood || undefined), o);
          const colors = pal.toJSON();
          const json = {
            id: "kit_" + hashString(safeJson(o)).toString(36), mood: o.mood || null, medium: (o.style && o.style.medium) || null, style: clone(o.style || {}), axes: clone(o.axes || {}), harmony: o.harmony || null, seed: o.seed != null ? o.seed : null,
            colors, ramps: { accent: paletteHelpers.ramp(colors.accent, 5), surface: paletteHelpers.ramp(colors.surface, 5) },
            type: { display: "system-ui, -apple-system, sans-serif", body: "system-ui, -apple-system, sans-serif", mono: "ui-monospace, Menlo, monospace", scale: [12, 14, 16, 20, 28, 40] },
            surface: { radius: 14, padding: 16 }, shape: { radius: 12, corner: "rounded" }, stroke: { width: 2, color: colors.line }, glow: { color: colors.accent, strength: 0.4 },
            shadow: { css: "0 8px 24px rgba(0,0,0,0.35)" }, fx: { accent: colors.accent }, materialHints: {}
          };
          const cssVars = (prefix) => { const p = prefix || "--bit"; const out = {}; for (const r of ROLE_NAMES) out[p + "-" + r] = colors[r]; out[p + "-radius"] = json.shape.radius + "px"; return out; };
          return Object.freeze(Object.assign({}, json, {
            cssVars,
            applyCssVars(rootEl, opts) { const vars = cssVars(opts && opts.prefix); if (rootEl && rootEl.style) for (const k of Object.keys(vars)) rootEl.style.setProperty(k, vars[k]); return vars; },
            toJSON() { return clone(json); }
          }));
        }
      };
    }

    const EASE = {
      linear: (t) => t,
      inQuad: (t) => { t = clamp(t, 0, 1); return t * t; },
      outQuad: (t) => { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); },
      inOutQuad: (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
      inCubic: (t) => { t = clamp(t, 0, 1); return t * t * t; },
      outCubic: (t) => { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); },
      inOutCubic: (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
      outBack: (t) => { t = clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
      inOutBack: (t) => { t = clamp(t, 0, 1); const c2 = 1.70158 * 1.525; return t < 0.5 ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2 : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2; },
      outElastic: (t) => { t = clamp(t, 0, 1); const c4 = (2 * Math.PI) / 3; return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; },
      outBounce: (t) => { t = clamp(t, 0, 1); const n1 = 7.5625, d1 = 2.75; if (t < 1 / d1) return n1 * t * t; if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75; if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375; return n1 * (t -= 2.625 / d1) * t + 0.984375; }
    };
    function makeRandom(seed) {
      const next = mulberry32(seedToInt(seed));
      const r = {
        float: () => next(),
        range: (min, max) => { const a = isNum(min) ? min : 0, b = isNum(max) ? max : 1; return a + (b - a) * next(); },
        int: (min, max) => { const a = Math.ceil(isNum(min) ? min : 0), b = Math.floor(isNum(max) ? max : 1); return a + Math.floor(next() * (b - a + 1)); },
        pick: (items) => (Array.isArray(items) && items.length ? items[Math.floor(next() * items.length)] : undefined),
        chance: (p) => next() < (isNum(p) ? p : 0.5),
        shuffle: (items) => { const a = Array.isArray(items) ? items.slice() : []; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
        sign: () => (next() < 0.5 ? -1 : 1),
        unitVec2: () => { const a = next() * Math.PI * 2; return { x: Math.cos(a), y: Math.sin(a) }; },
        insideCircle: (radius) => { const rr = (isNum(radius) ? radius : 1) * Math.sqrt(next()), a = next() * Math.PI * 2; return { x: Math.cos(a) * rr, y: Math.sin(a) * rr }; },
        onCircle: (radius) => { const rr = isNum(radius) ? radius : 1, a = next() * Math.PI * 2; return { x: Math.cos(a) * rr, y: Math.sin(a) * rr }; },
        weighted: (items, weights) => { if (!Array.isArray(items) || !items.length) return undefined; const w = Array.isArray(weights) ? weights : items.map(() => 1); const total = w.reduce((s, v) => s + Math.max(0, Number(v) || 0), 0); if (total <= 0) return undefined; let x = next() * total; for (let i = 0; i < items.length; i++) { x -= Math.max(0, Number(w[i]) || 0); if (x < 0) return items[i]; } return items[items.length - 1]; },
        gaussian: (mean, dev) => { const u = 1 - next(), v = next(); return (isNum(mean) ? mean : 0) + (isNum(dev) ? dev : 1) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
      };
      return r;
    }
    function makeNoise(seed, options) {
      const base = seedToInt(seed);
      const defaults = Object.assign({ scale: 1, amplitude: 1, frequency: 1, octaves: 4, lacunarity: 2, gain: 0.5 }, options || {});
      const lattice = (ix, iy, iz) => { let h = base ^ Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(iz | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return ((h >>> 0) / 4294967295) * 2 - 1; };
      const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
      const lerp = (a, b, t) => a + (b - a) * t;
      const v3 = (x, y, z) => {
        const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
        const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
        const c = (dx, dy, dz) => lattice(xi + dx, yi + dy, zi + dz);
        return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), xf), lerp(c(0, 1, 0), c(1, 1, 0), xf), yf), lerp(lerp(c(0, 0, 1), c(1, 0, 1), xf), lerp(c(0, 1, 1), c(1, 1, 1), xf), yf), zf);
      };
      const out = (v, o) => { const amp = isNum(o.amplitude) ? o.amplitude : 1; let r = v * amp; if (Array.isArray(o.range)) r = o.range[0] + ((v + 1) / 2) * (o.range[1] - o.range[0]); else if (o.normalize) r = (v + 1) / 2; return r; };
      const opt = (o) => Object.assign({}, defaults, o || {});
      const sc = (o) => (isNum(o.scale) ? o.scale : 1) * (isNum(o.frequency) ? o.frequency : 1);
      const fbm = (fn, o) => { let sum = 0, amp = 1, freq = 1, norm = 0; for (let i = 0; i < Math.max(1, Math.min(10, o.octaves | 0)); i++) { sum += fn(freq) * amp; norm += amp; amp *= o.gain; freq *= o.lacunarity; } return sum / norm; };
      const n = {
        value1: (x, o) => { const q = opt(o); return out(v3(x * sc(q), 0.5, 0.5), q); },
        value2: (x, y, o) => { const q = opt(o); return out(v3(x * sc(q), y * sc(q), 0.5), q); },
        value3: (x, y, z, o) => { const q = opt(o); return out(v3(x * sc(q), y * sc(q), z * sc(q)), q); },
        fbm2: (x, y, o) => { const q = opt(o); return out(fbm((f) => v3(x * sc(q) * f, y * sc(q) * f, 0.5), q), q); },
        fbm3: (x, y, z, o) => { const q = opt(o); return out(fbm((f) => v3(x * sc(q) * f, y * sc(q) * f, z * sc(q) * f), q), q); }
      };
      n.simplex2 = n.perlin2 = n.noise2D = n.value2;
      n.simplex3 = n.perlin3 = n.noise3D = n.value3;
      n.fbm2D = n.fbm2; n.fbm3D = n.fbm3;
      return n;
    }
    function makeMathCurve(points, opts) {
      const step = opts && opts.interpolation === "step";
      const pts = normalizePoints(points);
      return { points: pts, at: (x) => (step ? (pts.length ? (x < pts[0].x ? pts[0].y : pts.filter((p) => p.x <= x).pop().y) : 0) : evalPoints(pts, "linear", Number(x))) };
    }
    const vec2 = {
      create: (x, y) => ({ x: x || 0, y: y || 0 }),
      set: (o, x, y) => { o.x = x; o.y = y; return o; },
      copy: (a, o) => { o = o || {}; o.x = a.x; o.y = a.y; return o; },
      add: (a, b, o) => { o = o || {}; o.x = a.x + b.x; o.y = a.y + b.y; return o; },
      sub: (a, b, o) => { o = o || {}; o.x = a.x - b.x; o.y = a.y - b.y; return o; },
      mul: (a, b, o) => { o = o || {}; o.x = a.x * b.x; o.y = a.y * b.y; return o; },
      div: (a, b, o) => { o = o || {}; o.x = a.x / b.x; o.y = a.y / b.y; return o; },
      scale: (a, s, o) => { o = o || {}; o.x = a.x * s; o.y = a.y * s; return o; },
      length: (a) => Math.hypot(a.x, a.y),
      normalize: (a, o) => { o = o || {}; const l = Math.hypot(a.x, a.y); o.x = l ? a.x / l : 0; o.y = l ? a.y / l : 0; return o; },
      distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
      dot: (a, b) => a.x * b.x + a.y * b.y,
      lerp: (a, b, t, o) => { o = o || {}; o.x = a.x + (b.x - a.x) * t; o.y = a.y + (b.y - a.y) * t; return o; },
      clampLength: (a, min, max, o) => { o = o || {}; const l = Math.hypot(a.x, a.y); const t = clamp(l, min || 0, isNum(max) ? max : Infinity); const k = l ? t / l : 0; o.x = a.x * k; o.y = a.y * k; return o; },
      angle: (a) => Math.atan2(a.y, a.x),
      angleBetween: (a, b) => Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y),
      fromAngle: (r, len, o) => { o = o || {}; const l = isNum(len) ? len : 1; o.x = Math.cos(r) * l; o.y = Math.sin(r) * l; return o; },
      rotate: (a, r, o) => { o = o || {}; const c = Math.cos(r), s = Math.sin(r), x = a.x * c - a.y * s, y = a.x * s + a.y * c; o.x = x; o.y = y; return o; },
      perp: (a, o) => { o = o || {}; const x = -a.y, y = a.x; o.x = x; o.y = y; return o; },
      project: (a, onto, o) => { o = o || {}; const d = onto.x * onto.x + onto.y * onto.y; const k = d ? (a.x * onto.x + a.y * onto.y) / d : 0; o.x = onto.x * k; o.y = onto.y * k; return o; },
      reflect: (a, n, o) => { o = o || {}; const d = 2 * (a.x * n.x + a.y * n.y); o.x = a.x - d * n.x; o.y = a.y - d * n.y; return o; }
    };
    vec2.len = vec2.length; vec2.lenSq = (a) => a.x * a.x + a.y * a.y; vec2.lengthSq = vec2.lenSq; vec2.norm = vec2.normalize; vec2.dist = vec2.distance;
    vec2.distSq = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y); vec2.distanceSq = vec2.distSq;
    const MATH = {
      clamp: (v, min, max) => clamp(v, isNum(min) ? min : 0, isNum(max) ? max : 1),
      clamp01: (v) => clamp(v, 0, 1),
      saturate: (v) => clamp(v, 0, 1),
      lerp: (a, b, t) => a + (b - a) * t,
      invLerp: (a, b, v) => (a === b ? 0 : (v - a) / (b - a)),
      unlerp: (a, b, v) => (a === b ? 0 : (v - a) / (b - a)),
      remap: (v, inMin, inMax, outMin, outMax, o) => { let t = inMin === inMax ? 0 : (v - inMin) / (inMax - inMin); if (o && o.clamp) t = clamp(t, 0, 1); if (o && o.easing && EASE[o.easing]) t = EASE[o.easing](t); return outMin + (outMax - outMin) * t; },
      approach: (v, target, maxDelta) => (v < target ? Math.min(target, v + Math.abs(maxDelta)) : Math.max(target, v - Math.abs(maxDelta))),
      wrap: (v, min, max) => { const lo = isNum(min) ? min : 0, hi = isNum(max) ? max : 1, r = hi - lo; return r === 0 ? lo : lo + ((((v - lo) % r) + r) % r); },
      pingPong: (v, length) => { const l = isNum(length) ? length : 1; if (!l) return 0; const t = ((v % (2 * l)) + 2 * l) % (2 * l); return l - Math.abs(t - l); },
      deadzone: (v, amount) => { const a = Math.abs(amount || 0); return Math.abs(v) <= a ? 0 : Math.sign(v) * (Math.abs(v) - a) / (1 - a || 1); },
      snap: (v, step) => { const s = step || 1; return Math.round(v / s) * s; },
      roundTo: (v, step) => { const s = step || 1; return Math.round(v / s) * s; },
      signNonZero: (v) => (v < 0 ? -1 : 1),
      mod: (v, d) => ((v % d) + d) % d,
      smoothstep: (min, max, v) => { const t = clamp(min === max ? 0 : (v - min) / (max - min), 0, 1); return t * t * (3 - 2 * t); },
      smootherstep: (min, max, v) => { const t = clamp(min === max ? 0 : (v - min) / (max - min), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); },
      smoothDamp: (current, target, velocity, smoothTime, maxSpeed, deltaTime) => {
        const st = Math.max(0.0001, isNum(smoothTime) ? smoothTime : 0.2), dt = isNum(deltaTime) ? deltaTime : 1 / 60, ms = isNum(maxSpeed) ? maxSpeed : Infinity;
        const omega = 2 / st, x = omega * dt, exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
        let change = current - target; const maxChange = ms * st; change = clamp(change, -maxChange, maxChange);
        const t2 = current - change; const temp = ((velocity || 0) + omega * change) * dt;
        let vel = ((velocity || 0) - omega * temp) * exp; let out = t2 + (change + temp) * exp;
        if ((target - current > 0) === (out > target)) { out = target; vel = (out - target) / dt; }
        return { value: out, velocity: vel };
      },
      spring: (value, target, velocity, o) => {
        const k = (o && o.stiffness) || 180, c = (o && o.damping) || 20, m = (o && o.mass) || 1, dt = (o && o.deltaTime) || 1 / 60;
        const a = (-k * (value - target) - c * (velocity || 0)) / m; const v = (velocity || 0) + a * dt; return { value: value + v * dt, velocity: v };
      },
      angle: {
        normalize: (r) => { let a = ((r + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a; },
        normalizePositive: (r) => ((r % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
        delta: (a, b) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return d; },
        lerp: (a, b, t) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * t; },
        toRad: (deg) => (deg * Math.PI) / 180,
        toDeg: (rad) => (rad * 180) / Math.PI,
        turnDirection: (a, b) => { const d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return d > 0 ? 1 : d < 0 ? -1 : 0; }
      },
      vec2,
      random: (seed) => makeRandom(seed),
      noise: Object.assign((seed, options) => makeNoise(seed, options), {
        value2: (seed, x, y, o) => makeNoise(seed).value2(x, y, o),
        fbm2: (seed, x, y, o) => makeNoise(seed).fbm2(x, y, o)
      }),
      ease: EASE,
      curve: (points, opts) => makeMathCurve(points, opts),
      envelope: (o) => {
        const e = { attackMs: Math.max(0, (o && o.attackMs) || 0), decayMs: Math.max(0, (o && o.decayMs) || 0), sustain: clamp(o && isNum(o.sustain) ? o.sustain : 1, 0, 1), releaseMs: Math.max(0, (o && o.releaseMs) || 0) };
        e.at = (t, releasedAt) => {
          const level = (x) => (x < e.attackMs ? (e.attackMs ? x / e.attackMs : 1) : x < e.attackMs + e.decayMs ? 1 - (1 - e.sustain) * ((x - e.attackMs) / (e.decayMs || 1)) : e.sustain);
          if (isNum(releasedAt) && t >= releasedAt) { const l0 = level(releasedAt); return e.releaseMs ? Math.max(0, l0 * (1 - (t - releasedAt) / e.releaseMs)) : 0; }
          return level(Math.max(0, t));
        };
        return e;
      },
      color: {
        rgb: (r, g, b, a) => ({ r: clamp(r || 0, 0, 255), g: clamp(g || 0, 0, 255), b: clamp(b || 0, 0, 255), a: clamp(isNum(a) ? a : 1, 0, 1) }),
        hsl: (h, s, l, a) => hslToRgb(h || 0, s || 0, l || 0, isNum(a) ? a : 1),
        hex: (text) => { const s = String(text || "").replace(/^#/, ""); if (!/^([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return { r: 0, g: 0, b: 0, a: 1 }; const e = s.length <= 4 ? s.split("").map((c) => c + c).join("") : s; return { r: parseInt(e.slice(0, 2), 16), g: parseInt(e.slice(2, 4), 16), b: parseInt(e.slice(4, 6), 16), a: e.length === 8 ? parseInt(e.slice(6, 8), 16) / 255 : 1 }; },
        lerp: (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: (isNum(a.a) ? a.a : 1) + ((isNum(b.a) ? b.a : 1) - (isNum(a.a) ? a.a : 1)) * t }),
        toCss: (c) => "rgba(" + Math.round(c.r) + ", " + Math.round(c.g) + ", " + Math.round(c.b) + ", " + (isNum(c.a) ? Math.round(c.a * 1000) / 1000 : 1) + ")"
      }
    };
    const normRect = (r) => ({ x: r.x || 0, y: r.y || 0, w: r.w ?? r.width ?? 0, h: r.h ?? r.height ?? 0 });
    const normCircle = (c) => ({ cx: c.cx ?? c.x ?? 0, cy: c.cy ?? c.y ?? 0, r: c.r ?? c.radius ?? 0 });
    const segDist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy; const t = l ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l, 0, 1) : 0; return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)); };
    const GEOMETRY = {
      point: (x, y) => ({ x: x || 0, y: y || 0 }),
      segment: (a, b) => ({ a, b }),
      rect: { fromCenter: (cx, cy, w, h) => ({ x: cx - w / 2, y: cy - h / 2, w, h }), center: (r, o) => { const n = normRect(r); o = o || {}; o.x = n.x + n.w / 2; o.y = n.y + n.h / 2; return o; } },
      hit: {
        rectPoint: (r, p) => { const n = normRect(r); return p.x >= n.x && p.x <= n.x + n.w && p.y >= n.y && p.y <= n.y + n.h; },
        circlePoint: (c, p) => { const n = normCircle(c); return Math.hypot(p.x - n.cx, p.y - n.cy) <= n.r; },
        pointPolygon: (p, pts) => polygonContains(pts || [], p),
        circleCircle: (a, b) => { const x = normCircle(a), y = normCircle(b); return Math.hypot(x.cx - y.cx, x.cy - y.cy) <= x.r + y.r; },
        rectRect: (a, b) => { const x = normRect(a), y = normRect(b); return x.x <= y.x + y.w && x.x + x.w >= y.x && x.y <= y.y + y.h && x.y + x.h >= y.y; },
        circleRect: (c, r) => { const n = normCircle(c), q = normRect(r); const px = clamp(n.cx, q.x, q.x + q.w), py = clamp(n.cy, q.y, q.y + q.h); return Math.hypot(n.cx - px, n.cy - py) <= n.r; }
      },
      distance: {
        pointPoint: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
        pointSegment: (p, a, b) => segDist(p, a, b),
        pointRect: (p, r) => { const n = normRect(r); const dx = Math.max(n.x - p.x, 0, p.x - (n.x + n.w)), dy = Math.max(n.y - p.y, 0, p.y - (n.y + n.h)); return Math.hypot(dx, dy); },
        pointCircle: (p, c) => { const n = normCircle(c); return Math.max(0, Math.hypot(p.x - n.cx, p.y - n.cy) - n.r); }
      },
      heading: (a, b) => Math.atan2(b.y - a.y, b.x - a.x),
      pointFromHeading: (origin, heading, distance, o) => { o = o || {}; o.x = origin.x + Math.cos(heading) * distance; o.y = origin.y + Math.sin(heading) * distance; return o; }
    };

    // ---------------------------------------------------------------------------------------------
    // Storage, fonts, libraries and permission-gated stubs
    // ---------------------------------------------------------------------------------------------
    function makeStorage() {
      const prefix = () => storageKey("storage:");
      const need = (what) => {
        if (hasPerm("storage")) return;
        log("error", "ctx.storage." + what + " without the \"storage\" permission → NotAllowedError");
        throw notAllowed("ctx.storage requires the \"storage\" permission in manifest.permissions");
      };
      return {
        get(key) { need("get"); try { const raw = win.localStorage.getItem(prefix() + key); return raw == null ? null : JSON.parse(raw); } catch (_) { return null; } },
        set(key, value) { need("set"); try { win.localStorage.setItem(prefix() + key, JSON.stringify(value)); } catch (_) {} },
        remove(key) { need("remove"); try { win.localStorage.removeItem(prefix() + key); } catch (_) {} },
        clear() {
          need("clear");
          try { const p = prefix(); for (let i = win.localStorage.length - 1; i >= 0; i--) { const k = win.localStorage.key(i); if (k && k.indexOf(p) === 0) win.localStorage.removeItem(k); } } catch (_) {}
        }
      };
    }

    const FONT_REGISTRY = {
      "cormorant-garamond": { family: "Cormorant Garamond", files: [{ weight: "300", style: "italic" }, { weight: "300", style: "normal" }] },
      inter: { family: "Inter", files: [{ weight: "400", style: "normal" }, { weight: "600", style: "normal" }, { weight: "700", style: "normal" }] },
      "nunito-sans": { family: "Nunito Sans", files: [{ weight: "400", style: "normal" }, { weight: "700", style: "normal" }] },
      "space-mono": { family: "Space Mono", files: [{ weight: "400", style: "normal" }, { weight: "700", style: "normal" }] },
      "space-grotesk": { family: "Space Grotesk", files: [{ weight: "300 700", style: "normal", variable: true }] },
      "press-start-2p": { family: "Press Start 2P", files: [{ weight: "400", style: "normal" }] },
      "bebas-neue": { family: "Bebas Neue", files: [{ weight: "400", style: "normal" }] },
      "dm-serif-display": { family: "DM Serif Display", files: [{ weight: "400", style: "italic" }, { weight: "400", style: "normal" }] }
    };
    function pickFontFile(entry, weight, style) {
      const w = weight == null ? null : String(weight).trim();
      const s = style === "italic" ? "italic" : "normal";
      const matchW = (f) => {
        if (w == null) return true;
        if (f.variable) {
          const [lo, hi] = f.weight.split(/\s+/).map(Number);
          const parts = w.split(/\s+/).map(Number);
          return parts.every((x) => Number.isFinite(x) && x >= lo && x <= hi);
        }
        return f.weight === w;
      };
      return entry.files.find((f) => f.style === s && matchW(f)) || null;
    }
    function loadFont(family, nameOrUrl, versionOrOptions, maybeOptions) {
      let name = nameOrUrl, version = versionOrOptions, options = maybeOptions || {};
      const m = typeof nameOrUrl === "string" ? nameOrUrl.match(/^https:\/\/libs\.plethora\.studio\/fonts\/([a-z0-9-]+)\/([0-9.]+)\/([^/]+)\.ttf$/) : null;
      if (m) {
        name = m[1]; version = m[2]; options = Object.assign({}, versionOrOptions || {});
        const file = m[3];
        if (!options.weight) options.weight = file === "variable" ? undefined : file.split("-")[0];
        if (!options.style && /italic/.test(file)) options.style = "italic";
      } else if (typeof nameOrUrl === "string" && /^https?:/i.test(nameOrUrl)) {
        return Promise.reject(hostError("font_unavailable", "ctx.loadFont: only exact libs.plethora.studio font registry URLs are accepted (got " + nameOrUrl + ")", { name: "NotAllowedError" }));
      }
      const label = "loadFont(\"" + family + "\", " + name + "@" + version + (options.weight ? ", weight " + options.weight : "") + (options.style ? ", " + options.style : "") + ")";
      if (typeof family !== "string" || !family.trim()) return Promise.reject(new TypeError("ctx.loadFont: family must be a non-empty local CSS family name"));
      const entry = FONT_REGISTRY[name];
      if (!entry || version !== "1.0.0") {
        log("error", label + " → rejected: not an approved Font Registry entry (" + Object.keys(FONT_REGISTRY).map((k) => k + "@1.0.0").join(", ") + ")");
        return Promise.reject(hostError("font_unavailable", "ctx.loadFont: " + name + "@" + version + " is not in the Plethora Font Registry"));
      }
      const deps = Array.isArray(H.manifest.dependencies) ? H.manifest.dependencies : [];
      const pin = name + "@" + version;
      const declared = deps.some((d) => d === pin || (d && typeof d === "object" && d.name === name && d.version === version));
      if (!declared) warnOnce("font-undeclared:" + pin, label + ": \"" + pin + "\" is not in manifest.dependencies. sdk.md lists \"missing declaration\" among loadFont rejections but also says fonts resolve against the Font Registry; the harness loads it anyway. Confirm on the real host.");
      let file = pickFontFile(entry, options.weight, options.style);
      if (!file) {
        file = entry.files.find((f) => f.style === (options.style === "italic" ? "italic" : "normal")) || entry.files[0];
        warnOnce("font-weight:" + pin + ":" + options.weight, label + ": no registry file for weight " + options.weight + " / " + (options.style || "normal") + "; available: " + entry.files.map((f) => f.weight + " " + f.style).join(", ") + ". Using " + file.weight + " " + file.style + ".");
      }
      const ital = file.style === "italic" ? 1 : 0;
      const wght = file.variable ? file.weight.replace(/\s+/, "..") : file.weight;
      const axes = ital ? ":ital,wght@1," + wght : ":wght@" + wght;
      const url = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(entry.family).replace(/%20/g, "+") + axes + "&display=swap";
      log("font", label + " → loading (approximated with Google Fonts: " + entry.family + ")");
      const p = _fetch(url, { mode: "cors", credentials: "omit" })
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .then((css) => {
          const blocks = [];
          const re = /(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g;
          let mm;
          while ((mm = re.exec(css))) {
            const body = mm[2];
            const src = (body.match(/src:\s*url\(([^)]+)\)/) || [])[1];
            if (!src) continue;
            blocks.push({ subset: mm[1] || "", src: src.replace(/["']/g, ""), unicodeRange: ((body.match(/unicode-range:\s*([^;]+);/) || [])[1] || "").trim() });
          }
          if (!blocks.length) throw new Error("no @font-face rules in the Google Fonts response");
          const descriptors = { style: options.style || file.style, weight: options.weight ? String(options.weight) : (file.variable ? file.weight : file.weight), display: options.display || "swap" };
          const faces = blocks.map((b) => {
            const d = Object.assign({}, descriptors);
            if (b.unicodeRange) d.unicodeRange = b.unicodeRange;
            const f = new FontFace(family, "url(" + b.src + ")", d);
            doc.fonts.add(f);
            return { f, subset: b.subset };
          });
          return Promise.all(faces.map((x) => x.f.load())).then(() => {
            const main = (faces.find((x) => x.subset === "latin") || faces[faces.length - 1]).f;
            log("font", label + " → loaded as \"" + family + "\" (" + faces.length + " subset" + (faces.length === 1 ? "" : "s") + ")");
            return main;
          });
        })
        .catch((err) => {
          log("error", label + " → rejected: " + (err && err.message ? err.message : err) + " (harness needs network for the Google Fonts approximation)");
          throw hostError("font_load_failed", "ctx.loadFont failed: " + (err && err.message ? err.message : err));
        });
      H.fontLoads.push(p.catch(() => {}));
      return p;
    }
    function notInHarness(what) {
      return function () {
        log("error", what + "(" + Array.from(arguments).map((a) => safeJson(a, 60)).join(", ") + ") → rejected: not available in the harness (registry libraries are not emulated)");
        return Promise.reject(hostError("not_available_in_harness", what + " is not available in the harness: registry libraries/resources are not emulated. Test this path on the real host."));
      };
    }
    function makeCamera() {
      return {
        start() { return Promise.reject(hasPerm("camera") ? hostError("camera_unavailable", "Camera is not available in the harness", { name: "NotSupportedError" }) : notAllowed("ctx.camera requires the \"camera\" permission")); },
        stop() {}, pause() {}, resume() {},
        flip() { return Promise.resolve(null); },
        snapshot() { return null; },
        zoom() {},
        get ready() { return false; }, get width() { return 0; }, get height() { return 0; }, get facing() { return null; }
      };
    }
    function makeMicrophone() {
      return {
        start() { return Promise.reject(hasPerm("microphone") ? hostError("microphone_unavailable", "Microphone is not available in the harness", { name: "NotSupportedError" }) : notAllowed("ctx.microphone requires the \"microphone\" permission")); },
        stop() {}
      };
    }
    function makeMotion() {
      const zero = { x: 0, y: 0, z: 0 };
      return {
        start() { return Promise.reject(hasPerm("motion") ? hostError("motion_unavailable", "Motion sensors are not available in the harness", { name: "NotSupportedError" }) : notAllowed("ctx.motion requires the \"motion\" permission")); },
        stop() {}, pause() {}, resume() {},
        get available() { return false; }, get active() { return false; }, get permission() { return "unavailable"; }, get error() { return null; },
        get snapshot() { return { atMs: 0, source: "none", orientation: null, tilt: zero, control: { x: 0, y: 0 }, acceleration: zero, accelerationIncludingGravity: zero, gravity: zero, rotationRate: { alpha: 0, beta: 0, gamma: 0 }, gyroscope: zero, magnetometer: zero, quaternion: { x: 0, y: 0, z: 0, w: 1 }, calibrated: false, permission: "unavailable" }; },
        on() { return function () {}; },
        onChange() { return function () {}; }
      };
    }
    function makeSensors() {
      return { get available() { return hasPerm("motion"); }, get active() { return false; }, start() { return Promise.resolve(true); }, onChange() { return function () {}; }, get snapshot() { return null; } };
    }
    function makeAssets() {
      const fail = (what) => () => Promise.reject(hostError("assets_unavailable", "ctx.assets." + what + " is unavailable: packaged assets are disabled (maxAssets is 0)"));
      return {
        url(path) { throw hostError("assets_unavailable", "ctx.assets.url(" + safeJson(path, 60) + ") is unavailable: packaged assets are disabled (maxAssets is 0)"); },
        image: fail("image"), audio: fail("audio"), json: fail("json"), text: fail("text")
      };
    }
    function makeCtxFetch(life) {
      return function (url, options) {
        const u = String(url && url.url ? url.url : url);
        if (!/^(data:|blob:|about:)/i.test(u)) {
          log("error", "ctx.fetch(" + u.slice(0, 80) + ") → rejected: http/https network egress is denied (data:/blob:/about: only)");
          return Promise.reject(new TypeError("ctx.fetch: network egress is denied; only data:/blob:/about: URLs are supported"));
        }
        if (isDead(life, "ctx.fetch")) return Promise.resolve(undefined);
        const ac = new AbortController();
        const dispose = own(life, () => ac.abort(), "fetch");
        return _fetch(u, Object.assign({}, options || {}, { signal: ac.signal }))
          .then((r) => { dispose(); return r; }, (e) => { dispose(); if (e && e.name === "AbortError") return undefined; throw e; });
      };
    }

    // ---------------------------------------------------------------------------------------------
    // ctx construction
    // ---------------------------------------------------------------------------------------------
    const RUNTIME_INFO = Object.freeze({ version: RUNTIME_VERSION, schemaVersion: 1 });
    const VIEWER = Object.freeze({ username: "tester" });
    const sharedMath = guard(MATH, "ctx.math", "math");
    const sharedGeometry = guard(GEOMETRY, "ctx.geometry", "geometry");

    function buildCtx(life) {
      const ctx = {};
      const ro = (name, get) => Object.defineProperty(ctx, name, { get, enumerable: true, configurable: false });
      const caps = Object.freeze({ audio: hasPerm("audio"), backgroundMusic: hasPerm("backgroundMusic"), camera: false, haptics: hasPerm("haptics"), microphone: false, motion: false, storage: hasPerm("storage") });
      ro("container", () => container);
      ro("width", () => H.env.width);
      ro("height", () => H.env.height);
      ro("dpr", () => currentDpr());
      ro("nativeDpr", () => currentDpr());
      ro("safeArea", () => H.insets.safeArea);
      ro("contentSafeArea", () => H.insets.contentSafeArea);
      ro("logoArea", () => H.insets.logoArea);
      ro("manifest", () => H.manifest);
      ro("runtime", () => RUNTIME_INFO);
      ro("capabilities", () => caps);
      ro("viewer", () => VIEWER);
      Object.defineProperty(ctx, "chrome", { value: undefined, enumerable: true });
      ctx.markVisualReady = function (reason) {
        if (isDead(life, "ctx.markVisualReady")) return;
        life.visualReady = true;
        log("platform", "markVisualReady(" + (reason === undefined ? "" : safeJson(reason, 80)) + ")");
        shell.visualReady("markVisualReady");
      };
      ctx.onResize = function (cb, opts) {
        if (typeof cb !== "function") throw new TypeError("ctx.onResize(callback, options) needs a function");
        if (isDead(life, "ctx.onResize")) return function () {};
        const o = opts || {};
        const sub = { cb, debounceMs: Math.max(0, Number(o.debounceMs) || 0), timer: 0 };
        life.resizeSubs.add(sub);
        const dispose = own(life, () => { life.resizeSubs.delete(sub); if (sub.timer) _clearTimeout(sub.timer); }, "resize listener");
        if (o.immediate) callResize(sub, resizePayload(), true);
        return dispose;
      };
      ctx.createRoot = (opts) => createRoot(life, opts);
      ctx.createCanvas2D = (opts) => createCanvas2D(life, opts);
      ctx.createCanvas = (opts) => createCanvas(life, opts);
      ctx.surface = guard(makeSurfaceApi(life), "ctx.surface", "surface");
      ctx.listen = makeListen(life);
      ctx.onFrame = function (cb) {
        if (typeof cb !== "function") throw new TypeError("ctx.onFrame needs a function");
        if (isDead(life, "ctx.onFrame")) return;
        life.frameCbs.push(cb);
        if (life.frameCbs.length > 1) warnOnce("onframe-many:" + life.id, "ctx.onFrame registered " + life.frameCbs.length + " callbacks; register once during init (never inside itself)");
        ensureTicking();
      };
      ctx.raf = function (cb) {
        warnOnce("raf-alias", "ctx.raf is a legacy alias for ctx.onFrame (a persistent callback, not a one-shot rAF)");
        return ctx.onFrame(cb);
      };
      ctx.timeout = function (fn, ms) {
        if (typeof fn !== "function") throw new TypeError("ctx.timeout(fn, ms) needs a function");
        if (isDead(life, "ctx.timeout")) return;
        let dispose = null;
        const id = _setTimeout(() => { if (dispose) dispose(); guardCall(fn, "ctx.timeout callback"); }, Math.max(0, Number(ms) || 0));
        dispose = own(life, () => _clearTimeout(id), "timer");
      };
      ctx.interval = function (fn, ms) {
        if (typeof fn !== "function") throw new TypeError("ctx.interval(fn, ms) needs a function");
        if (isDead(life, "ctx.interval")) return;
        const id = _setInterval(() => guardCall(fn, "ctx.interval callback"), Math.max(1, Number(ms) || 0));
        own(life, () => _clearInterval(id), "interval");
      };
      ctx.onDestroy = function (fn) {
        if (typeof fn !== "function") throw new TypeError("ctx.onDestroy needs a function");
        if (life.destroyed) { warnOnce("ondestroy-late:" + life.id, "ctx.onDestroy registered after destroy; it will not run"); return; }
        life.destroyCbs.push(fn);
      };
      ctx.cleanup = function () {
        log("error", "Bit called ctx.cleanup(): do not call it manually; Plethora owns unload cleanup (the harness destroys now, as the host would)");
        destroyLife(life, "ctx.cleanup() called by the Bit");
      };
      ctx.input = guard(makeInput(life), "ctx.input", "input");
      const game = {
        loop: (opts) => makeLoop(life, opts),
        timer: makeTimer,
        cooldown: makeCooldown,
        every: makeEvery,
        sequence: makeSequence,
        stateMachine: makeStateMachine,
        bounds: makeBounds,
        random: (seed) => { const r = mulberry32(seedToInt(seed)); return function nextRandom() { return r(); }; },
        clamp: (v, min, max) => clamp(v, min, max),
        lerp: (a, b, t) => a + (b - a) * t,
        approach: MATH.approach,
        wrap: (v, min, max) => MATH.wrap(v, min, max),
        score: makeScoreFactory(life),
        progress: guard(makeProgress(life), "ctx.game.progress", "progress")
      };
      ctx.game = guard(game, "ctx.game", "game");
      ctx.platform = guard(makePlatform(life), "ctx.platform", "platform");
      ctx.pulse = guard(makePulse(life), "ctx.pulse", "pulse");
      ctx.share = makeShare(life);
      ctx.music = guard(H.music.api(life), "ctx.music", "music");
      ctx.audio = guard(makeAudio(life), "ctx.audio", "audio");
      ctx.memory = guard(makeMemory(life), "ctx.memory", "memory");
      ctx.fx = guard(makeFxContext(life, null), "ctx.fx", "fx");
      ctx.tune = guard(makeTune(life), "ctx.tune", "tune");
      ctx.onboarding = guard(H.onboarding.api, "ctx.onboarding", "onboarding");
      ctx.visual = guard(makeVisual(), "ctx.visual", "visual");
      ctx.math = sharedMath;
      ctx.geometry = sharedGeometry;
      ctx.storage = guard(makeStorage(), "ctx.storage", "storage");
      ctx.fetch = makeCtxFetch(life);
      ctx.loadFont = loadFont;
      ctx.loadScript = notInHarness("ctx.loadScript");
      ctx.importModule = notInHarness("ctx.importModule");
      ctx.registry = { resources: notInHarness("ctx.registry.resources") };
      ctx.mediapipe = { hands: notInHarness("ctx.mediapipe.hands") };
      ctx.camera = makeCamera();
      ctx.microphone = makeMicrophone();
      ctx.motion = makeMotion();
      ctx.sensors = makeSensors();
      ctx.assets = makeAssets();
      return guard(ctx, "ctx", "ctx");
    }

    function statusSnapshot() {
      const life = H.life;
      return {
        status: H.status,
        hostPaused: H.hostPaused,
        width: H.env.width,
        height: H.env.height,
        dpr: currentDpr(),
        mode: H.env.mode,
        device: H.env.device,
        attempt: H.attempt,
        hostScore: life && life.primary ? life.primary.synced : null,
        surfaces: life ? life.surfaces.size : 0,
        errors: H.errors,
        music: H.music ? H.music.snapshot() : null,
        readyCalled: !!(life && life.readyCalled),
        visualReady: !!(life && life.visualReady)
      };
    }

    // ---------------------------------------------------------------------------------------------
    // Host API used by the shell (same origin, called across the iframe boundary)
    // ---------------------------------------------------------------------------------------------
    H.music = createMusicEngine();

    function setManifestJson(json) {
      let m = {};
      try { m = JSON.parse(json || "{}") || {}; } catch (e) { log("error", "manifest JSON could not be parsed: " + e.message); m = {}; }
      if (typeof m !== "object" || Array.isArray(m)) m = {};
      const norm = Object.assign({ schemaVersion: 1, runtime: RUNTIME_VERSION, entry: "main.js", tags: [], permissions: [], dependencies: [] }, m);
      H.manifest = deepFreeze(norm);
      H.bitKey = slug(norm.title || norm.entry);
      H.tune = createTuneStore();
      H.onboarding = createOnboarding();
      if (norm.display !== "fullscreen") log("warn", "manifest.display is " + safeJson(norm.display) + ": publishing requires \"fullscreen\" (422 display_fullscreen_required); drafts are still saved");
      if (norm.runtime !== RUNTIME_VERSION) log("warn", "manifest.runtime is " + safeJson(norm.runtime) + "; expected " + RUNTIME_VERSION);
      const unknownPerms = (norm.permissions || []).filter((p) => ["audio", "backgroundMusic", "camera", "haptics", "microphone", "motion", "storage"].indexOf(p) < 0);
      if (unknownPerms.length) log("warn", "manifest.permissions has unknown entries: " + unknownPerms.join(", "));
    }

    function setEnvironment(env, reason) {
      const e = JSON.parse(JSON.stringify(env));
      if (e.mode !== "legacy") { e.contentSafeArea = e.contentSafeArea || Object.assign({}, e.safeArea); }
      else { delete e.contentSafeArea; delete e.logoArea; }
      const modeChanged = H.env.mode !== e.mode;
      H.env = e;
      H.insets = buildInsets(e);
      applyCssVariables();
      if (modeChanged && H.life && !H.life.destroyed) log("warn", "Display mode switched to " + (e.mode === "legacy" ? "the legacy safe frame" : "full screen") + " while the Bit is running (a real host never switches mid-run; Re-init for a clean start)");
      emitResize(reason || "environment", true);
      shell.status(statusSnapshot());
    }

    function loadBit(url) {
      return new Promise((resolve, reject) => {
        try { delete win.plethoraBit; } catch (_) { win.plethoraBit = undefined; }
        const errors = [];
        const onErr = (ev) => { if (ev.filename && ev.filename.indexOf(url.split("?")[0]) >= 0) errors.push(ev.error || new Error(ev.message)); };
        win.addEventListener("error", onErr);
        const s = doc.createElement("script");
        s.__harnessOwned = true;
        s.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + Date.now();
        s.onload = () => {
          win.removeEventListener("error", onErr);
          if (errors.length) { reject(errors[0]); return; }
          const bit = win.plethoraBit || win.scrollerApp;
          if (!bit || typeof bit.init !== "function") {
            reject(new Error("The Bit script loaded but did not assign window.plethoraBit = { async init(ctx) {} } (found " + safeJson(win.plethoraBit) + ")"));
            return;
          }
          if (!win.plethoraBit && win.scrollerApp) log("warn", "Bit assigned the compatibility global window.scrollerApp; prefer window.plethoraBit");
          H.bit = bit;
          H.bitUrl = url;
          if (bit.meta) log("host", "plethoraBit.meta", bit.meta);
          resolve(true);
        };
        s.onerror = () => {
          win.removeEventListener("error", onErr);
          reject(new Error("Could not load the Bit script " + url + " (network error or 404)"));
        };
        doc.head.appendChild(s);
      });
    }

    async function init() {
      if (!H.bit) throw new Error("No Bit loaded");
      if (H.life && !H.life.destroyed) return H.ctx;
      const life = createLife();
      H.life = life;
      H.status = "initializing";
      H.attempt = 0;
      H.hostPaused = false;
      warned.forEach((k) => { if (k.indexOf("dead:") === 0) warned.delete(k); });
      life.lastResizeKey = resizeKey();
      const ctx = buildCtx(life);
      H.ctx = ctx;
      shell.status(statusSnapshot());
      log("lifecycle", "init #" + life.id + " → window.plethoraBit.init(ctx) (" + H.env.width + "×" + H.env.height + ", " + (H.env.mode === "legacy" ? "legacy safe frame" : "full screen") + ", dpr " + currentDpr() + ")");
      ensureTicking();
      const t0 = now();
      try {
        await H.bit.init(ctx);
      } catch (err) {
        if (H.life === life) { H.status = "error"; shell.status(statusSnapshot()); }
        reportError(err, "window.plethoraBit.init(ctx)");
        throw err;
      }
      if (life.destroyed) return ctx;
      H.status = "running";
      log("lifecycle", "init resolved in " + Math.round(now() - t0) + "ms (" + life.surfaces.size + " surface" + (life.surfaces.size === 1 ? "" : "s") + ")");
      if (!life.readyCalled && !life.visualReady) {
        _setTimeout(() => {
          if (H.life === life && !life.destroyed && !life.readyCalled && !life.visualReady) {
            log("warn", "init resolved 2s ago but neither ctx.platform.ready() nor ctx.markVisualReady() was called; the host keeps its loader up until one is");
            shell.visualReady("timeout");
          }
        }, 2000);
      }
      if (H.onboarding) H.onboarding.autoStart();
      shell.status(statusSnapshot());
      return ctx;
    }

    function hostPause() {
      const life = H.life;
      if (H.hostPaused || !life || life.destroyed) return false;
      H.hostPaused = true;
      stopTicking();
      flushPrimary(life, "host pause");
      for (const loop of Array.from(life.loops)) loop._hostPause();
      for (const t of Array.from(life.trackers)) t._cancelAll();
      for (const a of life.animations) { try { a.pause(); } catch (_) {} }
      for (const el of life.audioEls) { try { el.pause(); } catch (_) {} }
      H.music.hostPause();
      H.status = "paused";
      log("lifecycle", "host paused: frames, loops, fx and music suspended; active pointers cancelled");
      shell.status(statusSnapshot());
      return true;
    }
    function hostResume() {
      const life = H.life;
      if (!H.hostPaused || !life || life.destroyed) return false;
      H.hostPaused = false;
      for (const loop of Array.from(life.loops)) loop._hostResume();
      for (const a of life.animations) { try { a.play(); } catch (_) {} }
      H.music.hostResume();
      H.status = "running";
      lastFrameT = 0;
      ensureTicking();
      log("lifecycle", "host resumed");
      shell.status(statusSnapshot());
      return true;
    }

    function tapAt(x, y, opts) {
      const o = opts || {};
      const el = doc.elementFromPoint(x, y);
      if (!el) return Promise.resolve({ target: null, x, y });
      const pointerType = o.pointerType || "touch";
      const base = { bubbles: true, cancelable: true, composed: true, view: win, clientX: x, clientY: y, screenX: x, screenY: y, pointerId: 101, pointerType, isPrimary: true, width: 1, height: 1 };
      const down = new PointerEvent("pointerdown", Object.assign({}, base, { button: 0, buttons: 1, pressure: 0.5 }));
      el.dispatchEvent(down);
      if (!down.defaultPrevented) el.dispatchEvent(new MouseEvent("mousedown", Object.assign({}, base, { button: 0, buttons: 1, detail: 1 })));
      const holdMs = isNum(o.holdMs) ? o.holdMs : 40;
      const describe = (n) => n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + (n.className && typeof n.className === "string" && n.className ? "." + n.className.trim().split(/\s+/).join(".") : "");
      return new Promise((resolve) => {
        _setTimeout(() => {
          el.dispatchEvent(new PointerEvent("pointerup", Object.assign({}, base, { button: 0, buttons: 0, pressure: 0 })));
          if (!down.defaultPrevented) el.dispatchEvent(new MouseEvent("mouseup", Object.assign({}, base, { button: 0, buttons: 0, detail: 1 })));
          el.dispatchEvent(new MouseEvent("click", Object.assign({}, base, { button: 0, buttons: 0, detail: 1 })));
          resolve({ target: describe(el), x, y });
        }, holdMs);
      });
    }

    function clearStorage() {
      let n = 0;
      try {
        const p = STORAGE_PREFIX + H.bitKey + ":";
        for (let i = win.localStorage.length - 1; i >= 0; i--) { const k = win.localStorage.key(i); if (k && k.indexOf(p) === 0) { win.localStorage.removeItem(k); n++; } }
      } catch (_) {}
      H.progress.clear();
      H.checkpoints = new Map();
      if (H.onboarding) H.onboarding.clear();
      log("host", "cleared " + n + " harness storage key" + (n === 1 ? "" : "s") + " (local memory, boards, ctx.storage, onboarding completion)");
      return n;
    }

    return {
      DEVICES,
      connect(api) { shell = Object.assign({}, shell, api); },
      setManifestJson,
      setEnvironment,
      setDpr(v) {
        const n = Number(v);
        H.dprOverride = v == null || v === "" || !Number.isFinite(n) || n <= 0 ? null : n;
        log("host", "dpr → " + currentDpr() + (H.dprOverride == null ? " (native)" : " (override)"));
        emitResize("dpr change", true);
        shell.status(statusSnapshot());
      },
      setLatency(ms) { H.latencyMs = Math.max(0, Number(ms) || 0); log("host", "memory latency → " + H.latencyMs + "ms"); },
      setFail(o) { if (typeof o === "boolean") H.failRecords = o; else { if (o && hasOwn(o, "records")) H.failRecords = !!o.records; if (o && hasOwn(o, "local")) H.failLocal = !!o.local; } log("host", "fail toggles → records " + H.failRecords + ", local memory/progress " + H.failLocal); },
      setMuted(m) { H.muted = !!m; H.music.setMuted(H.muted); for (const life of [H.life]) if (life) for (const el of life.audioEls) el.muted = H.muted; log("host", "mute → " + H.muted); },
      loadBit,
      init,
      destroy(reason) { if (H.life && !H.life.destroyed) { destroyLife(H.life, reason || "harness Destroy"); return true; } return false; },
      pause: hostPause,
      resume: hostResume,
      tapAt,
      clearStorage,
      onboardingAction(a) { if (H.onboarding) H.onboarding.hostAction(a); },
      tuneSet(id, value) { const changed = H.tune.set(id, value, "panel"); return changed; },
      tuneApplyPreset(id) { return H.tune.applyPreset(id, "panel preset " + id); },
      tuneReset() { return H.tune.reset(null, "panel reset"); },
      tuneSnapshot() { return JSON.stringify(H.tune.snapshot()); },
      fontsReady() { return Promise.all(H.fontLoads.slice()).then(() => doc.fonts.ready).then(() => true); },
      get ctx() { return H.ctx; },
      get bitLoaded() { return !!H.bit; },
      status: statusSnapshot,
      musicState() { return H.music.snapshot(); }
    };
  }

  // =============================================================================================
  // SHELL ROLE: the harness page (index.html)
  // =============================================================================================
  function createShell() {
    const doc = document;
    const $ = (id) => doc.getElementById(id);
    const params = new URLSearchParams(location.search);
    const S = {
      device: hasOwn(DEVICES, params.get("device")) ? params.get("device") : "iphone17pro",
      narrow: false,
      fit: params.get("fit") !== "0",
      showSafe: params.get("safe") === "1",
      dpr: params.get("dpr") || "",
      latency: params.get("latency") != null && Number.isFinite(+params.get("latency")) ? +params.get("latency") : 600,
      failRecords: params.get("fail") === "1",
      failLocal: false,
      muted: params.get("mute") === "1",
      manifest: {},
      manifestJson: "{}",
      bitUrl: null,
      bitLabel: null,
      env: null,
      runtime: null,
      frame: null,
      log: [],
      t0: performance.now(),
      status: null,
      loaderTimer: 0
    };
    const els = {};

    // ---- log ----
    const LOG_CAP = 1500;
    function log(kind, msg, data) {
      const t = (performance.now() - S.t0) / 1000;
      const dataText = data == null ? "" : String(data);
      console.info("[harness]", kind, msg, dataText);
      const last = S.log[S.log.length - 1];
      const box = els.log;
      if (last && last.kind === kind && last.msg === msg && last.data === dataText) {
        last.count++;
        last.t = t;
        if (last.node) {
          last.node.querySelector(".hx-entry-n").textContent = "×" + last.count;
          last.node.querySelector(".hx-entry-t").textContent = "+" + t.toFixed(3) + "s";
        }
        return;
      }
      const entry = { t, kind, msg, data: dataText, count: 1, node: null };
      S.log.push(entry);
      if (S.log.length > LOG_CAP) { const old = S.log.shift(); if (old.node && old.node.parentNode) old.node.remove(); }
      if (!box) return;
      const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 32;
      const row = doc.createElement("div");
      row.className = "hx-entry";
      row.setAttribute("data-kind", kind);
      const ts = doc.createElement("span"); ts.className = "hx-entry-t"; ts.textContent = "+" + t.toFixed(3) + "s";
      const k = doc.createElement("span"); k.className = "hx-entry-k"; k.textContent = kind;
      const m = doc.createElement("span"); m.className = "hx-entry-m"; m.textContent = msg;
      row.append(ts, k, m);
      if (dataText) { const d = doc.createElement("code"); d.className = "hx-entry-d"; d.textContent = dataText; row.append(d); }
      const n = doc.createElement("span"); n.className = "hx-entry-n"; row.append(n);
      box.append(row);
      entry.node = row;
      if (stick) box.scrollTop = box.scrollHeight;
    }
    function clearLog() {
      S.log = [];
      if (els.log) els.log.textContent = "";
      S.t0 = performance.now();
    }

    // ---- DOM ----
    function buildPhone() {
      const stage = $("hx-stage");
      stage.innerHTML = "";
      const sizer = doc.createElement("div"); sizer.id = "hx-sizer";
      const phone = doc.createElement("div"); phone.id = "hx-phone";
      const screen = doc.createElement("div"); screen.id = "hx-screen";
      const decor = doc.createElement("div"); decor.id = "hx-decor"; decor.setAttribute("aria-hidden", "false");
      decor.innerHTML =
        '<div id="hx-hostbar-top" class="hx-hostbar"></div><div id="hx-hostbar-bottom" class="hx-hostbar"></div>' +
        '<div class="hx-island"></div><div class="hx-punch"></div><div class="hx-home"></div>' +
        '<div class="hx-navbar"><span>◁</span><span>○</span><span>▢</span></div>' +
        '<div id="hx-guides"></div><div id="hx-focus"></div><div id="hx-onboarding"></div>' +
        '<div id="hx-loader"><span>Loading Bit…</span></div>' +
        '<div id="hx-haptic-badge"></div>' +
        '<button id="hx-logo" type="button" aria-label="Plethora logo button (host control)">P</button>';
      screen.appendChild(decor);
      phone.appendChild(screen);
      const homeButton = doc.createElement("div"); homeButton.className = "hx-sebutton";
      const speaker = doc.createElement("div"); speaker.className = "hx-sespeaker";
      phone.append(homeButton, speaker);
      sizer.appendChild(phone);
      const err = doc.createElement("div"); err.id = "hx-error"; err.hidden = true;
      err.innerHTML = '<div class="hx-error-head"><strong>Bit failed</strong><button type="button" id="hx-error-close">Dismiss</button></div><pre id="hx-error-text"></pre>';
      stage.append(sizer, err);
      Object.assign(els, { stage, sizer, phone, screen, decor, logo: $("hx-logo"), guides: $("hx-guides"), focus: $("hx-focus"), onboarding: $("hx-onboarding"), loader: $("hx-loader"), hapticBadge: $("hx-haptic-badge"), error: err, errorText: $("hx-error-text") });
      $("hx-error-close").addEventListener("click", () => { err.hidden = true; });
      els.logo.addEventListener("click", () => {
        log("host", "logo tapped (host control; the Bit never receives this tap)");
        els.logo.animate([{ transform: "scale(1)" }, { transform: "scale(0.88)" }, { transform: "scale(1)" }], { duration: 180 });
      });
    }
    function createFrame() {
      return new Promise((resolve, reject) => {
        if (S.frame) S.frame.remove();
        const f = doc.createElement("iframe");
        f.id = "hx-device-frame";
        f.name = "plethora-device";
        f.title = "Plethora Bit device";
        f.setAttribute("allow", "autoplay");
        f.src = "device.html?v=" + Date.now();
        S.frame = f;
        els.screen.insertBefore(f, els.decor);
        const started = performance.now();
        const poll = () => {
          let host = null;
          try { host = f.contentWindow && f.contentWindow.PlethoraRuntimeHost; } catch (_) { host = null; }
          if (host) { resolve(host); return; }
          if (performance.now() - started > 10000) { reject(new Error("device.html did not expose PlethoraRuntimeHost within 10s")); return; }
          setTimeout(poll, 25);
        };
        f.addEventListener("load", poll, { once: true });
      });
    }
    function connectRuntime(rt) {
      S.runtime = rt;
      rt.connect({
        log,
        haptic: hapticPulse,
        status: (st) => { S.status = st; renderStatus(); },
        onboarding: renderOnboarding,
        tuneChanged: () => refreshTuneValues(),
        visualReady: (why) => hideLoader(why),
        errorCount: () => renderStatus()
      });
    }

    // ---- device frame ----
    function stageSize() {
      const r = els.stage.getBoundingClientRect();
      return { w: Math.floor(r.width), h: Math.floor(r.height) };
    }
    function envForRuntime(env) {
      const o = { device: env.device, label: env.label, mode: env.mode, width: env.width, height: env.height, safeArea: env.safeArea };
      if (env.mode !== "legacy") { o.contentSafeArea = env.contentSafeArea; o.logoArea = env.logoArea; }
      return o;
    }
    function applyDevice(reason) {
      const d = DEVICES[S.device];
      els.stage.classList.toggle("hx-stage-fill", !!d.fill);
      const st = stageSize();
      const env = computeEnvironment(S.device, { stageWidth: st.w, stageHeight: st.h, narrow: S.narrow });
      S.env = env;
      els.phone.className = "hx-chrome-" + env.chrome + (d.fill ? " hx-fill" : "") + (env.mode === "legacy" ? " hx-legacy" : "");
      els.screen.style.width = env.screenWidth + "px";
      els.screen.style.height = env.screenHeight + "px";
      els.screen.style.borderRadius = env.radius + "px";
      if (S.frame) {
        S.frame.style.top = env.containerTop + "px";
        S.frame.style.width = env.width + "px";
        S.frame.style.height = env.height + "px";
      }
      const top = $("hx-hostbar-top"), bottom = $("hx-hostbar-bottom");
      if (env.mode === "legacy") {
        top.style.cssText = "display:block;top:0;height:" + env.containerTop + "px";
        bottom.style.cssText = "display:block;top:" + (env.containerTop + env.height) + "px;bottom:0";
      } else {
        top.style.cssText = "display:none"; bottom.style.cssText = "display:none";
      }
      els.logo.style.left = env.logoRect.x + "px";
      els.logo.style.top = env.containerTop + env.logoRect.y + "px";
      els.logo.style.width = els.logo.style.height = LOGO_SIZE + "px";
      els.loader.style.top = env.containerTop + "px";
      els.loader.style.height = env.height + "px";
      renderGuides();
      fit();
      if (els.deviceSelect) els.deviceSelect.value = S.device;
      if (els.narrowBtn) els.narrowBtn.textContent = S.narrow ? "Restore width" : "Simulate resize (−20% width)";
      try { const u = new URL(location.href); u.searchParams.set("device", S.device); history.replaceState(null, "", u); } catch (_) {}
      if (S.runtime) S.runtime.setEnvironment(envForRuntime(env), reason || "device " + S.device);
    }
    function fit() {
      const d = DEVICES[S.device];
      const phoneRect = { w: els.phone.offsetWidth, h: els.phone.offsetHeight };
      const st = stageSize();
      let scale = 1;
      if (S.fit && !d.fill) scale = Math.min(1, (st.w - 24) / phoneRect.w, (st.h - 24) / phoneRect.h);
      scale = Math.max(0.25, scale);
      els.phone.style.transform = scale === 1 ? "" : "scale(" + scale + ")";
      els.sizer.style.width = phoneRect.w * scale + "px";
      els.sizer.style.height = phoneRect.h * scale + "px";
      S.scale = scale;
    }
    function renderGuides() {
      const g = els.guides;
      g.textContent = "";
      g.hidden = !S.showSafe;
      if (!S.showSafe || !S.env) return;
      const env = S.env;
      const box = (cls, label, inset) => {
        const b = doc.createElement("div");
        b.className = "hx-guide " + cls;
        b.style.left = inset.left + "px";
        b.style.right = env.screenWidth - env.width + inset.right + "px";
        b.style.top = env.containerTop + inset.top + "px";
        b.style.bottom = env.screenHeight - env.containerTop - env.height + inset.bottom + "px";
        const t = doc.createElement("span"); t.textContent = label; b.appendChild(t);
        g.appendChild(b);
      };
      box("hx-guide-safe", "safeArea", env.safeArea);
      if (env.contentSafeArea) box("hx-guide-content", "contentSafeArea", env.contentSafeArea);
      const r = env.logoRect;
      const l = doc.createElement("div");
      l.className = "hx-guide hx-guide-logo";
      l.style.cssText = "left:" + r.x + "px;top:" + (env.containerTop + r.y) + "px;width:" + r.width + "px;height:" + r.height + "px";
      g.appendChild(l);
    }
    function showLoader() {
      els.loader.classList.remove("hx-hidden");
      els.loader.hidden = false;
    }
    function hideLoader(why) {
      if (els.loader.hidden) return;
      els.loader.classList.add("hx-hidden");
      setTimeout(() => { els.loader.hidden = true; }, 220);
      if (why === "timeout") log("host", "host loader removed after timeout (no ready signal)");
    }
    function hapticPulse(type) {
      const strength = { light: 2, medium: 4, heavy: 7, success: 4, warning: 5, error: 7 }[type] || 3;
      els.screen.animate([{ transform: "translate(0,0)" }, { transform: "translate(" + strength / 2 + "px,0)" }, { transform: "translate(" + (-strength / 2) + "px,0)" }, { transform: "translate(0,0)" }], { duration: 120 });
      const b = els.hapticBadge;
      b.textContent = "haptic · " + type;
      b.getAnimations().forEach((a) => a.cancel());
      b.animate([{ opacity: 0, transform: "translate(-50%, 4px)" }, { opacity: 1, transform: "translate(-50%, 0)", offset: 0.2 }, { opacity: 1, offset: 0.7 }, { opacity: 0, transform: "translate(-50%, 0)" }], { duration: 700, fill: "forwards" });
    }
    function renderOnboarding(json) {
      const o = els.onboarding;
      o.textContent = "";
      els.focus.hidden = true;
      if (!json) { o.hidden = true; return; }
      const st = JSON.parse(json);
      o.hidden = false;
      const env = S.env;
      const area = env.contentSafeArea || env.safeArea;
      o.style.top = env.containerTop + area.top + 12 + "px";
      o.className = st.kind === "one_line" ? "hx-ob-pill" : "hx-ob-card";
      const item = st.item || {};
      if (item.title) { const h = doc.createElement("strong"); h.textContent = item.title; o.appendChild(h); }
      const p = doc.createElement("div"); p.textContent = item.body || item.message || ""; o.appendChild(p);
      const row = doc.createElement("div"); row.className = "hx-ob-actions";
      const btn = (label, action) => { const b = doc.createElement("button"); b.type = "button"; b.textContent = label; b.addEventListener("click", () => S.runtime.onboardingAction(action)); row.appendChild(b); };
      if (st.kind === "one_line") btn("OK", "confirm");
      else { btn("Skip", "skip"); btn(st.index + 1 >= st.count ? "Done" : "Next", "next"); }
      o.appendChild(row);
      if (st.focus) {
        const f = els.focus;
        f.hidden = false;
        f.style.cssText = "left:" + st.focus.x + "px;top:" + (env.containerTop + st.focus.y) + "px;width:" + st.focus.width + "px;height:" + st.focus.height + "px";
      }
    }
    function renderStatus() {
      const st = S.runtime ? S.runtime.status() : null;
      if (!st || !els.status) return;
      const m = st.music || {};
      els.status.textContent = st.status + (st.hostPaused ? " (host paused)" : "") + " · " + st.device + " " + st.width + "×" + st.height + (st.mode === "legacy" ? " legacy" : "") + " · dpr " + st.dpr + " · attempt " + st.attempt + " · host score " + (st.hostScore == null ? "–" : st.hostScore) + " · music " + (m.state || "–") + " · surfaces " + st.surfaces + " · errors " + st.errors;
      els.status.classList.toggle("hx-has-errors", st.errors > 0);
    }

    // ---- panel ----
    function wirePanel() {
      Object.assign(els, {
        log: $("harness-log"), status: $("hx-status"), deviceSelect: $("hx-device"), narrowBtn: $("hx-narrow"), tuning: $("hx-tuning"),
        panel: $("hx-panel"), manifestNote: $("hx-manifest-note"), bitPath: $("hx-bit-path"), title: $("hx-title")
      });
      for (const name of Object.keys(DEVICES)) {
        const opt = doc.createElement("option");
        opt.value = name; opt.textContent = DEVICES[name].label + " (" + name + ")";
        els.deviceSelect.appendChild(opt);
      }
      els.deviceSelect.value = S.device;
      els.deviceSelect.addEventListener("change", () => setDevice(els.deviceSelect.value));
      $("hx-dpr").value = S.dpr;
      $("hx-dpr").placeholder = String(window.devicePixelRatio || 1) + " (native)";
      $("hx-dpr").addEventListener("change", (e) => { S.dpr = e.target.value; if (S.runtime) S.runtime.setDpr(S.dpr); });
      $("hx-fit").checked = S.fit;
      $("hx-fit").addEventListener("change", (e) => { S.fit = e.target.checked; fit(); });
      $("hx-safe").checked = S.showSafe;
      $("hx-safe").addEventListener("change", (e) => { S.showSafe = e.target.checked; renderGuides(); });
      els.narrowBtn.addEventListener("click", () => { S.narrow = !S.narrow; applyDevice(S.narrow ? "simulated resize (−20% width)" : "simulated resize restored"); });
      $("hx-destroy").addEventListener("click", () => api.destroy());
      $("hx-reinit").addEventListener("click", () => { api.reinit().catch(() => {}); });
      $("hx-pause").addEventListener("click", () => { if (S.runtime && !S.runtime.pause()) log("host", "Pause ignored (nothing running or already paused)"); });
      $("hx-resume").addEventListener("click", () => { if (S.runtime && !S.runtime.resume()) log("host", "Resume ignored (not paused)"); });
      $("hx-reload").addEventListener("click", () => { api.reload().catch(() => {}); });
      $("hx-latency").value = S.latency;
      $("hx-latency").addEventListener("change", (e) => api.setLatency(e.target.value));
      $("hx-fail-records").checked = S.failRecords;
      $("hx-fail-records").addEventListener("change", (e) => api.setFail({ records: e.target.checked }));
      $("hx-fail-local").checked = S.failLocal;
      $("hx-fail-local").addEventListener("change", (e) => api.setFail({ local: e.target.checked }));
      $("hx-mute").checked = S.muted;
      $("hx-mute").addEventListener("change", (e) => api.setMuted(e.target.checked));
      $("hx-clear-storage").addEventListener("click", () => { if (S.runtime) S.runtime.clearStorage(); });
      $("hx-log-clear").addEventListener("click", clearLog);
      const gear = $("hx-gear");
      const wide = window.matchMedia("(min-width: 980px)");
      const setOpen = (open) => {
        doc.body.classList.toggle("hx-panel-open", open);
        gear.setAttribute("aria-expanded", String(open));
        setTimeout(() => { if (DEVICES[S.device].fill) applyDevice("panel toggled"); else fit(); }, 30);
      };
      setOpen(params.get("panel") === "0" ? false : params.get("panel") === "1" ? true : wide.matches);
      gear.addEventListener("click", () => setOpen(!doc.body.classList.contains("hx-panel-open")));
      let resizeTimer = 0;
      window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { if (DEVICES[S.device].fill) applyDevice("window resize"); else fit(); }, 80);
      });
    }

    // ---- tuning editors ----
    function buildTuning() {
      const box = els.tuning;
      box.textContent = "";
      const tuning = S.manifest.tuning || {};
      const knobs = tuning.knobs || {};
      const curves = tuning.curves || {};
      const groups = tuning.groups || {};
      const presets = tuning.presets || {};
      const ids = Object.keys(knobs);
      if (!ids.length && !Object.keys(curves).length) { box.innerHTML = '<p class="hx-muted">No manifest.tuning declared.</p>'; return; }
      const order = Object.keys(groups).concat(["__none"]);
      const byGroup = {};
      for (const id of ids) { const g = knobs[id].group && hasOwn(groups, knobs[id].group) ? knobs[id].group : "__none"; (byGroup[g] = byGroup[g] || []).push(id); }
      for (const g of order) {
        if (!byGroup[g]) continue;
        const h = doc.createElement("div"); h.className = "hx-tune-group"; h.textContent = g === "__none" ? "Other" : (groups[g].label || g);
        box.appendChild(h);
        for (const id of byGroup[g]) box.appendChild(knobRow(id, knobs[id]));
      }
      for (const id of Object.keys(curves)) box.appendChild(curveRow(id, curves[id]));
      const actions = doc.createElement("div"); actions.className = "hx-row";
      for (const pid of Object.keys(presets)) {
        const b = doc.createElement("button"); b.type = "button"; b.textContent = "Preset: " + (presets[pid].label || pid);
        b.addEventListener("click", () => { S.runtime.tuneApplyPreset(pid); refreshTuneValues(); });
        actions.appendChild(b);
      }
      const reset = doc.createElement("button"); reset.type = "button"; reset.textContent = "Reset tuning";
      reset.addEventListener("click", () => { S.runtime.tuneReset(); refreshTuneValues(); });
      actions.appendChild(reset);
      box.appendChild(actions);
      refreshTuneValues();
    }
    const tuneSetters = {};
    function knobRow(id, k) {
      const row = doc.createElement("label");
      row.className = "hx-tune";
      const name = doc.createElement("span"); name.className = "hx-tune-label"; name.textContent = (k.label || id) + (k.apply === "restart" ? " ↻" : "");
      name.title = id + " · " + k.type + (k.apply ? " · apply " + k.apply : "") + (k.apply === "restart" ? " (read at init/new run; Re-init to see it)" : "");
      row.appendChild(name);
      const send = (v) => { if (S.runtime) S.runtime.tuneSet(id, v); };
      const numeric = ["number", "integer", "duration_ms", "percent"].indexOf(k.type) >= 0;
      if (numeric) {
        const min = isNum(k.min) ? k.min : (k.type === "percent" ? 0 : null), max = isNum(k.max) ? k.max : (k.type === "percent" ? 1 : null);
        const step = isNum(k.step) ? k.step : (k.type === "integer" ? 1 : k.type === "percent" ? 0.01 : "any");
        const wrap = doc.createElement("span"); wrap.className = "hx-tune-ctl";
        let range = null;
        if (min != null && max != null) { range = doc.createElement("input"); range.type = "range"; range.min = min; range.max = max; range.step = step; wrap.appendChild(range); }
        const num = doc.createElement("input"); num.type = "number"; if (min != null) num.min = min; if (max != null) num.max = max; num.step = step; wrap.appendChild(num);
        if (range) range.addEventListener("input", () => { num.value = range.value; send(Number(range.value)); });
        num.addEventListener("change", () => { if (range) range.value = num.value; send(Number(num.value)); });
        tuneSetters[id] = (v) => { num.value = v; if (range) range.value = v; };
        row.appendChild(wrap);
      } else if (k.type === "boolean") {
        const cb = doc.createElement("input"); cb.type = "checkbox";
        cb.addEventListener("change", () => send(cb.checked));
        tuneSetters[id] = (v) => { cb.checked = !!v; };
        row.appendChild(cb);
      } else if (k.type === "choice") {
        const sel = doc.createElement("select");
        for (const opt of k.options || []) { const o = doc.createElement("option"); o.value = opt; o.textContent = opt; sel.appendChild(o); }
        sel.addEventListener("change", () => send(sel.value));
        tuneSetters[id] = (v) => { sel.value = v; };
        row.appendChild(sel);
      } else if (k.type === "multi_choice") {
        const wrap = doc.createElement("span"); wrap.className = "hx-tune-ctl hx-wrap";
        const boxes = (k.options || []).map((opt) => { const l = doc.createElement("label"); const c = doc.createElement("input"); c.type = "checkbox"; c.value = opt; l.append(c, doc.createTextNode(opt)); wrap.appendChild(l); return c; });
        const read = () => boxes.filter((c) => c.checked).map((c) => c.value);
        boxes.forEach((c) => c.addEventListener("change", () => send(read())));
        tuneSetters[id] = (v) => { boxes.forEach((c) => { c.checked = Array.isArray(v) && v.indexOf(c.value) >= 0; }); };
        row.appendChild(wrap);
      } else if (k.type === "color") {
        const c = doc.createElement("input"); c.type = "color";
        const t = doc.createElement("input"); t.type = "text"; t.size = 9;
        c.addEventListener("input", () => { t.value = c.value; send(c.value); });
        t.addEventListener("change", () => { if (/^#[0-9a-f]{6}$/i.test(t.value)) c.value = t.value; send(t.value); });
        tuneSetters[id] = (v) => { t.value = v; if (/^#[0-9a-f]{6}$/i.test(v)) c.value = v; };
        const wrap = doc.createElement("span"); wrap.className = "hx-tune-ctl"; wrap.append(c, t); row.appendChild(wrap);
      } else if (k.type === "range" || k.type === "point2" || k.type === "vec2") {
        const a = doc.createElement("input"), b = doc.createElement("input");
        a.type = b.type = "number"; a.step = b.step = isNum(k.step) ? k.step : "any";
        const read = () => (k.type === "range" ? [Number(a.value), Number(b.value)] : { x: Number(a.value), y: Number(b.value) });
        a.addEventListener("change", () => send(read())); b.addEventListener("change", () => send(read()));
        tuneSetters[id] = (v) => { if (Array.isArray(v)) { a.value = v[0]; b.value = v[1]; } else if (v) { a.value = v.x; b.value = v.y; } };
        const wrap = doc.createElement("span"); wrap.className = "hx-tune-ctl"; wrap.append(a, b); row.appendChild(wrap);
      } else {
        const t = doc.createElement("input"); t.type = "text";
        t.addEventListener("change", () => send(k.type === "seed" && /^-?\d+$/.test(t.value) ? Number(t.value) : t.value));
        tuneSetters[id] = (v) => { t.value = v == null ? "" : String(v); };
        row.appendChild(t);
      }
      return row;
    }
    function curveRow(id, c) {
      const row = doc.createElement("label");
      row.className = "hx-tune hx-tune-curve";
      const name = doc.createElement("span"); name.className = "hx-tune-label"; name.textContent = (c.label || id) + " (curve)";
      name.title = id + " · domain " + c.domain + " · easing " + (c.easing || "linear");
      const ta = doc.createElement("textarea"); ta.rows = 2; ta.spellcheck = false;
      ta.addEventListener("change", () => { try { S.runtime.tuneSet(id, JSON.parse(ta.value)); ta.classList.remove("hx-bad"); } catch (_) { ta.classList.add("hx-bad"); } });
      tuneSetters[id] = (v) => { ta.value = JSON.stringify(v); };
      row.append(name, ta);
      return row;
    }
    function refreshTuneValues() {
      if (!S.runtime) return;
      let snap = {};
      try { snap = JSON.parse(S.runtime.tuneSnapshot()); } catch (_) {}
      for (const id of Object.keys(snap)) if (tuneSetters[id]) tuneSetters[id](snap[id]);
    }

    // ---- errors ----
    function showError(title, err) {
      const text = (err && err.stack ? String(err.stack) : String(err && err.message ? err.message : err));
      els.error.hidden = false;
      els.error.querySelector("strong").textContent = title;
      els.errorText.textContent = (err && err.message && text.indexOf(err.message) < 0 ? err.message + "\n" : "") + text;
      log("error", title + ": " + (err && err.message ? err.message : err));
    }

    // ---- public API used by index.html and window.__harness ----
    const api = {
      DEVICES,
      async start() {
        wirePanel();
        buildPhone();
        applyDevice("initial");
        log("host", "Plethora Bit harness · SDK " + SDK_VERSION + " · runtime " + RUNTIME_VERSION + " · device " + S.device);
        const rt = await createFrame();
        connectRuntime(rt);
        applyDevice("device frame ready");
        if (S.dpr) rt.setDpr(S.dpr);
        rt.setLatency(S.latency);
        rt.setFail({ records: S.failRecords, local: S.failLocal });
        if (S.muted) rt.setMuted(true);
        renderStatus();
        return api;
      },
      async fetchManifest(path) {
        const url = new URL(path, location.href).href;
        let json = "{}";
        let note = null;
        try {
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) throw new Error("HTTP " + r.status);
          const text = await r.text();
          JSON.parse(text);
          json = text;
        } catch (e) {
          note = "plethora.json not usable at " + path + " (" + e.message + "): running with {} (no permissions, memory, tuning or onboarding).";
        }
        S.manifestJson = json;
        S.manifest = JSON.parse(json);
        if (note) { log("warn", note); els.manifestNote.textContent = note; els.manifestNote.hidden = false; }
        else { els.manifestNote.hidden = true; log("host", "manifest loaded: " + (S.manifest.title || "(untitled)") + " · permissions [" + (S.manifest.permissions || []).join(", ") + "]"); }
        els.title.textContent = S.manifest.title || "Untitled Bit";
        S.runtime.setManifestJson(json);
        buildTuning();
        return S.manifest;
      },
      resolveBitPath(p) {
        const base = new URL("../", location.href);
        const u = new URL(p, base);
        if (u.origin !== location.origin) throw new Error("?bit= must point inside this server (got " + u.href + ")");
        S.bitLabel = p;
        return u.href;
      },
      async loadBit(url) {
        S.bitUrl = url;
        els.bitPath.textContent = S.bitLabel || url;
        try {
          const head = await fetch(url, { method: "HEAD", cache: "no-store" });
          if (!head.ok) throw new Error("HTTP " + head.status + " for " + new URL(url).pathname + (head.status === 404 ? " — build the Bit first (node plethora/build.mjs) or pass ?bit=harness/smoke-bit.js" : ""));
          await S.runtime.loadBit(url);
          log("host", "Bit script loaded: " + new URL(url).pathname);
        } catch (e) {
          showError("Could not load the Bit", e);
          throw e;
        }
      },
      async init() {
        if (!S.runtime || !S.runtime.bitLoaded) throw new Error("No Bit loaded");
        els.error.hidden = true;
        showLoader();
        try {
          await S.runtime.init();
        } catch (e) {
          hideLoader("error");
          showError("window.plethoraBit.init(ctx) threw", e);
          throw e;
        } finally {
          renderStatus();
        }
        return S.runtime.ctx;
      },
      destroy() {
        const did = S.runtime && S.runtime.destroy("harness Destroy");
        if (!did) log("host", "Destroy ignored (nothing running)");
        renderOnboarding(null);
        renderStatus();
        return !!did;
      },
      async reinit() {
        if (S.runtime) S.runtime.destroy("re-init");
        return api.init();
      },
      async reload() {
        let snap = "{}";
        try { if (S.runtime) { S.runtime.destroy("reload"); snap = S.runtime.tuneSnapshot(); } } catch (_) {}
        clearLogMarker("reload: fresh device document");
        const rt = await createFrame();
        connectRuntime(rt);
        rt.setManifestJson(S.manifestJson);
        applyDevice("device reloaded");
        if (S.dpr) rt.setDpr(S.dpr);
        rt.setLatency(S.latency);
        rt.setFail({ records: S.failRecords, local: S.failLocal });
        if (S.muted) rt.setMuted(true);
        try { const s = JSON.parse(snap); for (const id of Object.keys(s)) rt.tuneSet(id, s[id]); } catch (_) {}
        await api.loadBit(S.bitUrl);
        return api.init();
      },
      setDevice(name) {
        if (!hasOwn(DEVICES, name)) throw new Error("Unknown device \"" + name + "\" (use " + Object.keys(DEVICES).join(", ") + ")");
        S.device = name;
        S.narrow = false;
        applyDevice("device → " + name);
        return S.env;
      },
      simulateResize(on) { S.narrow = on === undefined ? !S.narrow : !!on; applyDevice(S.narrow ? "simulated resize (−20% width)" : "simulated resize restored"); return S.env; },
      setDpr(v) { S.dpr = v == null ? "" : String(v); const i = $("hx-dpr"); if (i) i.value = S.dpr; if (S.runtime) S.runtime.setDpr(S.dpr); },
      setLatency(ms) { S.latency = Math.max(0, Number(ms) || 0); const i = $("hx-latency"); if (i) i.value = S.latency; if (S.runtime) S.runtime.setLatency(S.latency); },
      setFail(v) {
        if (typeof v === "boolean") S.failRecords = v;
        else if (v && typeof v === "object") { if (hasOwn(v, "records")) S.failRecords = !!v.records; if (hasOwn(v, "local")) S.failLocal = !!v.local; }
        const a = $("hx-fail-records"), b = $("hx-fail-local");
        if (a) a.checked = S.failRecords; if (b) b.checked = S.failLocal;
        if (S.runtime) S.runtime.setFail({ records: S.failRecords, local: S.failLocal });
      },
      setMuted(m) { S.muted = !!m; const i = $("hx-mute"); if (i) i.checked = S.muted; if (S.runtime) S.runtime.setMuted(S.muted); },
      getLog() { return S.log.map((e) => ({ t: Math.round(e.t * 1000) / 1000, kind: e.kind, msg: e.msg, data: e.data, count: e.count })); },
      clearLog,
      async tapAt(x, y, opts) {
        const env = S.env;
        const fr = S.frame.getBoundingClientRect();
        const scale = fr.width / env.width || 1;
        const px = fr.left + x * scale, py = fr.top + y * scale;
        const hit = doc.elementFromPoint(px, py);
        const inLogo = x >= env.logoRect.x && x <= env.logoRect.x + env.logoRect.width && y >= env.logoRect.y && y <= env.logoRect.y + env.logoRect.height;
        if ((hit && hit.closest && hit.closest("#hx-logo")) || (!hit && inLogo)) { els.logo.click(); return { target: "host logo button", x, y }; }
        if (hit && hit.closest && hit.closest("#hx-onboarding button")) { hit.closest("button").click(); return { target: "host onboarding control", x, y }; }
        if (hit && hit !== S.frame && !S.frame.contains(hit) && !(hit.closest && hit.closest("#hx-decor"))) return { target: "outside the device: " + hit.tagName.toLowerCase() + (hit.id ? "#" + hit.id : ""), x, y };
        return S.runtime.tapAt(x, y, opts);
      },
      get ctx() { return S.runtime ? S.runtime.ctx : null; },
      get runtime() { return S.runtime; },
      get frame() { return S.frame; },
      get env() { return S.env; },
      get fontsReady() { return S.runtime ? S.runtime.fontsReady() : Promise.resolve(true); },
      status() { return S.runtime ? S.runtime.status() : null; },
      pause() { return S.runtime ? S.runtime.pause() : false; },
      resume() { return S.runtime ? S.runtime.resume() : false; },
      devices: Object.keys(DEVICES)
    };
    function clearLogMarker(msg) { log("host", msg); }
    return api;
  }

  if (ROLE === "runtime") {
    window.PlethoraRuntimeHost = createRuntime();
  } else {
    window.PlethoraHarnessShell = createShell();
  }
})();

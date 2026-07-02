/* The Jimmy Possum Chair — Field Guide interactions
   scroll-spy nav · progress · per-section tools · image lightbox · bench mode */
(function () {
  "use strict";
  var TOTAL = 10; // numbered build sections

  // GA4 event helper — no-op until gtag loads, or if analytics is blocked.
  function track(name, params) {
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
  }
  var seenSections = {}; // fire section_view once per section per visit

  // Real per-section tool kits, from the Workshop Manual. Sections not listed
  // here (story / reference / gallery / sources) hide the tools box.
  var toolsBySection = {
    sec1:    ["Sledgehammer", "Steel wedges", "Gluts", "Froe", "Froe club", "Riving brake"],
    sec2:    ["Shavehorse", "Drawknife", "Go/no-go gauge", "Pencil"],
    sec2b:   ["Drawknife", "Marking gauge", "Pencil"],
    sec3:    ["Marking gauge", "Ruler", "Pencil"],
    sec4:    ["Brace & 1″ bit", "Clamps", "Bevel gauge", "Scrap ply"],
    sec5:    ["Brace & bits", "Reamer", "Drawknife", "Saw", "Chisel", "12″ square"],
    sec6:    ["12″ square", "Bevel gauge", "Brace & ⅞″ bit", "Blocks & shims"],
    sec7:    ["Brace & bits", "Bevel gauge", "Dividers", "Saw"],
    sec8:    ["Spokeshave", "Drawknife", "Block plane", "Card scraper", "Rasp"],
    sec9:    ["Glue", "Mallet", "Shims", "Half-pencil", "Saw"],
    sec10:   ["Trenails / dowels", "Wedges", "Saw", "Scraper", "Oil / wax"],
    saddling:["Adze or gouge", "Inshave / scorp", "Travisher", "Scraper"]
  };

  var links = Array.prototype.slice.call(document.querySelectorAll("#toc a"));
  var sections = links.map(function (a) { return document.querySelector(a.getAttribute("href")); });
  var progText = document.getElementById("prog-text");
  var progPct  = document.getElementById("prog-pct");
  var pbarFill = document.getElementById("pbar-fill");
  var toolsNote = document.getElementById("tools-note");
  var toolsList = document.getElementById("tools-list");

  function setActive(idx) {
    links.forEach(function (l, i) { l.classList.toggle("active", i === idx); });
    var a = links[idx];
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    var step = parseInt(a.getAttribute("data-step"), 10);
    var phase = a.getAttribute("data-phase") || "";

    if (!seenSections[id]) {
      seenSections[id] = 1;
      track("section_view", { section_id: id, section_name: a.textContent.replace(/\s+/g, " ").trim().replace(/^·\s*/, "") });
    }

    if (step >= 1) {
      progText.textContent = "Section " + step + " of " + TOTAL;
      var pct = Math.round((step / TOTAL) * 100);
      progPct.textContent = pct + "%";
      pbarFill.style.width = pct + "%";
    } else {
      progText.textContent = phase || "Front matter";
      // notional fill so the bar isn't dead before/after the build
      var fill = phase === "Finishing up" ? 100 : (phase === "Reference" ? 8 : 2);
      progPct.textContent = fill + "%";
      pbarFill.style.width = fill + "%";
    }

    var tools = toolsBySection[id];
    if (tools) {
      toolsNote.classList.remove("hidden");
      toolsList.innerHTML = tools.map(function (t) { return "<li>" + t + "</li>"; }).join("");
    } else {
      toolsNote.classList.add("hidden");
    }
  }

  // section visibility helpers (bench mode display:none's the story sections)
  function isShown(el) { return !!el && el.offsetParent !== null; }
  function firstVisibleIndex() {
    for (var i = 0; i < sections.length; i++) if (isShown(sections[i])) return i;
    return 0;
  }
  function nearestVisibleIndex(from) {
    if (isShown(sections[from])) return from;
    for (var d = 1; d < sections.length; d++) {
      if (isShown(sections[from - d])) return from - d;
      if (isShown(sections[from + d])) return from + d;
    }
    return -1;
  }

  // scroll-spy
  var current = 0;
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        var i = sections.indexOf(e.target);
        if (i >= 0) { current = i; setActive(i); }
      }
    });
  }, { rootMargin: "-22% 0px -62% 0px", threshold: 0 });
  sections.forEach(function (s) { if (s) observer.observe(s); });
  setActive(0);

  // top dead zone: above the first section nothing intersects the observer band,
  // so reset to the first visible entry instead of leaving a stale pill
  window.addEventListener("scroll", function () {
    var idx = firstVisibleIndex();
    var s = sections[idx];
    if (s && s.getBoundingClientRect().top > window.innerHeight * 0.38 && current !== idx) {
      current = idx;
      setActive(idx);
    }
  }, { passive: true });

  // mobile nav drawer
  var rail = document.getElementById("rail");
  var scrim = document.getElementById("scrim");
  var menubtn = document.getElementById("menubtn");
  function openRail() {
    if (rail) rail.classList.add("open");
    if (scrim) scrim.classList.add("show");
    if (menubtn) menubtn.setAttribute("aria-expanded", "true");
  }
  function closeRail() {
    if (rail) rail.classList.remove("open");
    if (scrim) scrim.classList.remove("show");
    if (menubtn) menubtn.setAttribute("aria-expanded", "false");
  }
  if (menubtn) menubtn.addEventListener("click", function () {
    if (rail && rail.classList.contains("open")) closeRail(); else openRail();
  });
  if (scrim) scrim.addEventListener("click", closeRail);
  links.forEach(function (l) {
    l.addEventListener("click", function () {
      closeRail();
      track("nav_click", { target: l.getAttribute("href") });
    });
  });

  // reading mode toggle — Story (default) / Bench (condensed)
  var modeStory = document.getElementById("mode-story");
  var modeBench = document.getElementById("mode-bench");
  function setMode(bench) {
    if (document.body.classList.contains("bench") === bench) return; // no-op if unchanged
    // remember where the reader is before the layout reflows under them
    var fromIdx = current;
    var hero = document.querySelector(".hero");
    var inHero = hero && (window.scrollY || 0) < hero.offsetHeight * 0.6;

    document.body.classList.toggle("bench", bench);
    if (modeStory) { modeStory.classList.toggle("is-active", !bench); modeStory.setAttribute("aria-pressed", bench ? "false" : "true"); }
    if (modeBench) { modeBench.classList.toggle("is-active", bench); modeBench.setAttribute("aria-pressed", bench ? "true" : "false"); }

    // keep the reader's place: jump (instantly) back to the same section,
    // or the nearest one that's still visible in the new mode
    var idx = inHero ? firstVisibleIndex() : nearestVisibleIndex(fromIdx);
    if (idx >= 0 && sections[idx]) {
      if (!inHero) {
        var root = document.documentElement;
        var prevBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto"; // defeat css smooth scroll for this jump
        sections[idx].scrollIntoView({ block: "start" });
        root.style.scrollBehavior = prevBehavior;
      }
      current = idx;
      setActive(idx); // resync the progress pill + tools box
    }
    track("bench_mode", { state: bench ? "on" : "off" });
  }
  if (modeStory) modeStory.addEventListener("click", function () { setMode(false); });
  if (modeBench) modeBench.addEventListener("click", function () { setMode(true); });

  // image lightbox
  var lb = document.getElementById("lightbox");
  var lbImg = lb ? lb.querySelector("img") : null;
  var lbCap = lb ? lb.querySelector(".lb-cap") : null;
  var lbTrigger = null; // where focus returns on close
  if (lb) lb.setAttribute("tabindex", "-1"); // dialog must be focusable
  function openLB(src, cap, alt, trigger) {
    if (!lb) return;
    lbImg.src = src;
    lbImg.alt = alt || "";
    lbCap.textContent = cap || "";
    lb.classList.add("open");
    lb.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    lbTrigger = trigger || null;
    lb.focus();
    track("image_zoom", { image: (String(src).split("/").pop() || "").split("?")[0], caption: cap || "" });
  }
  function closeLB() {
    if (!lb || !lb.classList.contains("open")) return;
    lb.classList.remove("open");
    lb.setAttribute("aria-hidden", "true");
    lbImg.removeAttribute("src");
    lbImg.alt = "";
    document.body.style.overflow = "";
    if (lbTrigger) {
      if (!lbTrigger.hasAttribute("tabindex")) lbTrigger.setAttribute("tabindex", "-1");
      lbTrigger.focus();
      lbTrigger = null;
    }
  }
  document.addEventListener("click", function (e) {
    var img = e.target.closest(".fig-plate img, .photo img, .gallery-grid img, .hero-fig img");
    if (img) {
      var fig = img.closest("figure");
      var cap = fig ? (fig.querySelector("figcaption") || {}).textContent : img.alt;
      // gallery thumbs carry the full-size original in data-full
      openLB(img.dataset.full || img.currentSrc || img.src, cap, img.alt, img);
    }
  });
  if (lb) lb.addEventListener("click", closeLB);

  // Escape closes the lightbox first, then the nav drawer
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (lb && lb.classList.contains("open")) closeLB();
    else closeRail();
  });

  // cookie / consent banner — shows once; "Decline" opts the visitor out of analytics
  var webfoot = document.getElementById("webfoot");
  var consentKey = "jp-cookie-consent";
  var banner = document.getElementById("cookie-banner");
  if (banner) {
    var choice = null;
    try { choice = localStorage.getItem(consentKey); } catch (e) {}
    if (!choice) {
      banner.hidden = false;
      if (webfoot) webfoot.style.display = "none"; // keep the bottom uncluttered while the banner is up
    }
    var setConsent = function (val) {
      try { localStorage.setItem(consentKey, val); } catch (e) {}
      banner.hidden = true;
      if (webfoot) webfoot.style.display = ""; // restore (CSS still hides it on mobile)
    };
    var accept = document.getElementById("cb-accept");
    var decline = document.getElementById("cb-decline");
    if (accept) accept.addEventListener("click", function () { setConsent("accepted"); });
    if (decline) decline.addEventListener("click", function () {
      setConsent("declined");
      window["ga-disable-G-LC83Z5YM96"] = true; // stop further analytics this session
      // and expire the GA cookies already set — on the production domain and the bare host
      ["_ga", "_ga_LC83Z5YM96"].forEach(function (name) {
        var stale = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
        document.cookie = stale;                             // bare host (also covers localhost)
        document.cookie = stale + "; domain=.chairmak.ing";  // GA sets _ga on the registrable domain
      });
    });
  }

  // semi-sticky web footer — visible on load, hides on scroll down, returns on scroll up
  if (webfoot) {
    var yEl = document.getElementById("wf-year");
    if (yEl) { try { yEl.textContent = new Date().getFullYear(); } catch (e) {} }
    var lastY = window.scrollY || 0;
    window.addEventListener("scroll", function () {
      var y = window.scrollY || 0;
      if (Math.abs(y - lastY) > 6) {
        if (y > lastY && y > 90) webfoot.classList.add("down"); // scrolling down → hide
        else webfoot.classList.remove("down");                  // scrolling up → show
        lastY = y;
      }
    }, { passive: true });
  }
})();

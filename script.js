/* The Jimmy Possum Chair — Field Guide interactions
   scroll-spy nav · progress · per-section tools · image lightbox · bench mode */
(function () {
  "use strict";
  var TOTAL = 10; // numbered build sections

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
    sec9:    ["Mallet", "Shims", "Half-pencil", "Saw", "Flat surface"],
    sec10:   ["Trenails / dowels", "Saw", "Wedges", "Mallet"],
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

  // mobile nav drawer
  var rail = document.getElementById("rail");
  var scrim = document.getElementById("scrim");
  var menubtn = document.getElementById("menubtn");
  function closeRail() { rail.classList.remove("open"); scrim.classList.remove("show"); }
  if (menubtn) menubtn.addEventListener("click", function () { rail.classList.add("open"); scrim.classList.add("show"); });
  if (scrim) scrim.addEventListener("click", closeRail);
  links.forEach(function (l) { l.addEventListener("click", closeRail); });

  // bench mode
  var benchBtn = document.getElementById("benchbtn");
  if (benchBtn) benchBtn.addEventListener("click", function () {
    var on = document.body.classList.toggle("bench");
    benchBtn.setAttribute("aria-pressed", on ? "true" : "false");
    var lbl = benchBtn.querySelector(".lbl");
    if (lbl) lbl.textContent = on ? "Click to turn off Bench Mode" : "Click to turn on Bench Mode";
  });

  // image lightbox
  var lb = document.getElementById("lightbox");
  var lbImg = lb ? lb.querySelector("img") : null;
  var lbCap = lb ? lb.querySelector(".lb-cap") : null;
  function openLB(src, cap) {
    if (!lb) return;
    lbImg.src = src; lbCap.textContent = cap || "";
    lb.classList.add("open"); document.body.style.overflow = "hidden";
  }
  function closeLB() { if (!lb) return; lb.classList.remove("open"); lbImg.src = ""; document.body.style.overflow = ""; }
  document.addEventListener("click", function (e) {
    var img = e.target.closest(".fig-plate img, .photo img, .gallery-grid img, .hero-fig img");
    if (img) {
      var fig = img.closest("figure");
      var cap = fig ? (fig.querySelector("figcaption") || {}).textContent : img.alt;
      openLB(img.currentSrc || img.src, cap);
    }
  });
  if (lb) lb.addEventListener("click", closeLB);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLB(); });
})();

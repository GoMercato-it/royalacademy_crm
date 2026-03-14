define(["view"], function (View) {
  return View.extend({
    template: "custom:course-section/pdf-viewer",

    events: {
      'click [data-action="openReader"]': function () {
        this.openFullscreen();
      },
    },

    setup: function () {
      this.sectionId = this.resolveSectionId();
      this.sectionState = {
        hasPdf: false,
        hasUploadedPdfFile: false,
        initialized: false,
      };

      this.pdfStateRefreshTimer = null;
      this.pdfStateRefreshAttempts = 0;
      this.maxPdfStateRefreshAttempts = 40;
      this.pdfStateRefreshIntervalMs = 1500;

      if (this.model) {
        this.listenTo(this.model, "sync", this.handleModelStateChange.bind(this));
        this.listenTo(this.model, "change:id", this.ensureSectionIdAndReload.bind(this));
        this.listenTo(
          this.model,
          "change:pdfMinioKey change:pdfFileId change:pdfFileName",
          this.handleModelStateChange.bind(this),
        );
      }

      this.on("remove", function () {
        this.stopPdfStateRefresh();
      });

      // Load the freshest section state once and poll briefly if PDF is still processing.
      this.ensurePdfStateLoaded();
    },

    resolveSectionId: function () {
      if (this.model && this.model.id) {
        return this.model.id;
      }

      if (this.options && this.options.sectionId) {
        return this.options.sectionId;
      }

      var hash = window.location.hash || "";
      var match = hash.match(/#CourseSection\/view\/([a-zA-Z0-9]+)/);
      if (match && match[1]) {
        return match[1];
      }

      return null;
    },

    ensureSectionIdAndReload: function () {
      var prevSectionId = this.sectionId;
      this.sectionId = this.resolveSectionId();

      if (!this.sectionId || this.sectionId === prevSectionId) {
        return;
      }

      this.ensurePdfStateLoaded();
    },

    ensureRuntimeSectionId: function () {
      if (this.sectionId) {
        return this.sectionId;
      }

      var resolvedId = this.resolveSectionId();
      if (!resolvedId) {
        return null;
      }

      this.sectionId = resolvedId;
      this.ensurePdfStateLoaded();

      return this.sectionId;
    },

    data: function () {
      var modelHasPdf = this.model && !!this.model.get("pdfMinioKey");
      var hasPdf = modelHasPdf || !!this.sectionState.hasPdf;

      return {
        hasPdf: hasPdf,
      };
    },

    hasUploadedPdfFile: function () {
      if (this.sectionState.hasUploadedPdfFile) {
        return true;
      }

      if (!this.model) {
        return false;
      }

      return !!(
        this.model.get("pdfFileId") ||
        this.model.get("pdfFileName") ||
        this.model.get("pdfFile")
      );
    },

    handleModelStateChange: function () {
      this.ensureSectionIdAndReload();

      if (!this.model) {
        return;
      }

      this.syncSectionState(this.model.attributes || {});

      if (this.sectionState.hasPdf || !this.hasUploadedPdfFile()) {
        this.stopPdfStateRefresh();
      } else {
        this.startPdfStateRefresh();
      }

      this.reRender();
    },

    ensurePdfStateLoaded: function () {
      if (!this.sectionId) {
        return;
      }

      this.fetchModelState();
      this.probePdfAvailability();

      if (this.hasUploadedPdfFile() || !this.sectionState.initialized) {
        this.startPdfStateRefresh();
      }
    },

    startPdfStateRefresh: function () {
      if (this.pdfStateRefreshTimer) {
        return;
      }

      this.pdfStateRefreshAttempts = 0;

      var self = this;
      this.pdfStateRefreshTimer = setInterval(function () {
        self.refreshPdfState();
      }, this.pdfStateRefreshIntervalMs);
    },

    stopPdfStateRefresh: function () {
      if (!this.pdfStateRefreshTimer) {
        return;
      }

      clearInterval(this.pdfStateRefreshTimer);
      this.pdfStateRefreshTimer = null;
    },

    refreshPdfState: function () {
      if (!this.sectionId) {
        this.stopPdfStateRefresh();
        return;
      }

      if (this.model && this.model.get("pdfMinioKey")) {
        this.stopPdfStateRefresh();
        return;
      }

      if (this.pdfStateRefreshAttempts >= this.maxPdfStateRefreshAttempts) {
        this.stopPdfStateRefresh();
        return;
      }

      this.pdfStateRefreshAttempts++;

      this.fetchModelState();
      this.probePdfAvailability();
    },

    syncSectionState: function (data) {
      var hasPdf = !!(data && data.pdfMinioKey);
      var hasUploadedPdfFile = !!(
        data && (data.pdfFileId || data.pdfFileName || data.pdfFile)
      );

      this.sectionState.hasPdf = this.sectionState.hasPdf || hasPdf;
      this.sectionState.hasUploadedPdfFile =
        this.sectionState.hasUploadedPdfFile || hasUploadedPdfFile;
      this.sectionState.initialized = true;
    },

    getCourseSectionApiPath: function () {
      if (!this.sectionId) {
        return null;
      }

      var loc = window.location.pathname;
      var portalMatch = loc.match(/\/portal\/([^/]+)\//);

      return portalMatch
        ? "portal-access/" + portalMatch[1] + "/CourseSection/" + this.sectionId
        : "CourseSection/" + this.sectionId;
    },

    getPdfUrlProbeApiPath: function () {
      if (!this.sectionId) {
        return null;
      }

      var loc = window.location.pathname;
      var portalMatch = loc.match(/\/portal\/([^/]+)\//);

      return portalMatch
        ? "portal-access/" + portalMatch[1] + "/CourseSectionPdf/" + this.sectionId + "/url"
        : "CourseSectionPdf/" + this.sectionId + "/url";
    },

    fetchModelState: function () {
      if (!this.sectionId) {
        return;
      }

      var self = this;

      var fallbackRequest = function () {
        var apiPath = self.getCourseSectionApiPath();
        if (!apiPath) {
          return;
        }

        Espo.Ajax.getRequest(apiPath)
          .then(function (data) {
            self.syncSectionState(data || {});

            if (self.model) {
              self.model.set(data || {});
            }

            self.handleModelStateChange();
          })
          .catch(function () {
            if (self.pdfStateRefreshAttempts >= self.maxPdfStateRefreshAttempts) {
              self.stopPdfStateRefresh();
            }
          });
      };

      if (!this.model || typeof this.model.fetch !== "function") {
        fallbackRequest();
        return;
      }

      Promise.resolve(this.model.fetch())
        .then(function () {
          self.syncSectionState(self.model ? self.model.attributes || {} : {});
          self.handleModelStateChange();
        })
        .catch(function () {
          fallbackRequest();
        })
        .catch(function () {
          if (self.pdfStateRefreshAttempts >= self.maxPdfStateRefreshAttempts) {
            self.stopPdfStateRefresh();
          }
        });
    },

    probePdfAvailability: function () {
      if (!this.sectionId || this.sectionState.hasPdf) {
        return;
      }

      var apiPath = this.getPdfUrlProbeApiPath();
      if (!apiPath) {
        return;
      }

      var self = this;
      Espo.Ajax.getRequest(apiPath)
        .then(function () {
          self.sectionState.hasPdf = true;
          self.sectionState.initialized = true;
          self.stopPdfStateRefresh();
          self.reRender();
        })
        .catch(function () {
          // No-op: endpoint can return 403/404 while PDF key is not ready.
        });
    },

    openFullscreen: function () {
      this.ensureRuntimeSectionId();

      if (!this.sectionId) return;

      var self = this;
      var overlay = document.createElement("div");
      overlay.id = "pdf-fullscreen-overlay";
      overlay.innerHTML =
        '<div class="pdf-overlay-backdrop"></div>' +
        '<div class="pdf-overlay-container">' +
        '  <div class="pdf-overlay-header">' +
        '    <div class="pdf-header-title">' +
        '      <i class="fas fa-book-reader"></i>' +
        '      <span>' + (self.model.get("name") || "PDF Reader") + '</span>' +
        '    </div>' +
        '    <div class="pdf-header-controls">' +
        // View mode toggle
        '      <div class="pdf-view-toggle">' +
        '        <button class="pdf-btn pdf-view-btn active" id="pdf-mode-scroll" title="Scorrimento verticale"><i class="fas fa-arrows-alt-v"></i></button>' +
        '        <button class="pdf-btn pdf-view-btn" id="pdf-mode-single" title="Pagina singola"><i class="fas fa-arrows-alt-h"></i></button>' +
        '      </div>' +
        '      <span class="pdf-separator">|</span>' +
        // Single-page navigation (hidden by default)
        '      <div class="pdf-nav-single" id="pdf-nav-single" style="display:none;">' +
        '        <button class="pdf-btn" id="pdf-prev"><i class="fas fa-chevron-left"></i></button>' +
        '        <span id="pdf-current-page" style="min-width:60px;text-align:center;font-weight:500;">1 / 1</span>' +
        '        <button class="pdf-btn" id="pdf-next"><i class="fas fa-chevron-right"></i></button>' +
        '        <span class="pdf-separator">|</span>' +
        '      </div>' +
        // Zoom controls
        '      <button class="pdf-btn" id="pdf-zoom-out" title="Zoom Out"><i class="fas fa-search-minus"></i></button>' +
        '      <span id="pdf-zoom-level">100%</span>' +
        '      <button class="pdf-btn" id="pdf-zoom-in" title="Zoom In"><i class="fas fa-search-plus"></i></button>' +
        '      <span class="pdf-separator">|</span>' +
        '      <span id="pdf-page-info">Caricamento...</span>' +
        '      <span class="pdf-separator">|</span>' +
        '      <button class="pdf-btn pdf-btn-close" id="pdf-close" title="Chiudi"><i class="fas fa-times"></i></button>' +
        '    </div>' +
        '  </div>' +
        '  <div class="pdf-overlay-body" id="pdf-pages-container">' +
        '    <div class="pdf-loading"><i class="fas fa-spinner fa-spin"></i> Caricamento PDF...</div>' +
        '  </div>' +
        '</div>';

      document.body.appendChild(overlay);
      document.body.style.overflow = "hidden";

      if (!document.getElementById("pdf-overlay-styles")) {
        var style = document.createElement("style");
        style.id = "pdf-overlay-styles";
        style.textContent = this.getStyles();
        document.head.appendChild(style);
      }

      var state = {
        scale: 1.0,
        mode: "scroll", // "scroll" or "single"
        currentPage: 1,
        startPage: 1,
        endPage: 9999,
        pdfDoc: null,
      };

      var container = overlay.querySelector("#pdf-pages-container");

      // Close handlers
      overlay.querySelector("#pdf-close").addEventListener("click", function () {
        self.closeFullscreen(overlay);
      });
      overlay.querySelector(".pdf-overlay-backdrop").addEventListener("click", function () {
        self.closeFullscreen(overlay);
      });
      var escHandler = function (e) {
        if (e.key === "Escape") {
          self.closeFullscreen(overlay);
          document.removeEventListener("keydown", escHandler);
        }
      };
      document.addEventListener("keydown", escHandler);

      // Zoom
      overlay.querySelector("#pdf-zoom-in").addEventListener("click", function () {
        state.scale = Math.min(3.0, state.scale + 0.2);
        overlay.querySelector("#pdf-zoom-level").textContent = Math.round(state.scale * 100) + "%";
        rerender();
      });
      overlay.querySelector("#pdf-zoom-out").addEventListener("click", function () {
        state.scale = Math.max(0.3, state.scale - 0.2);
        overlay.querySelector("#pdf-zoom-level").textContent = Math.round(state.scale * 100) + "%";
        rerender();
      });

      // View mode toggle
      overlay.querySelector("#pdf-mode-scroll").addEventListener("click", function () {
        if (state.mode === "scroll") return;
        state.mode = "scroll";
        overlay.querySelector("#pdf-mode-scroll").classList.add("active");
        overlay.querySelector("#pdf-mode-single").classList.remove("active");
        overlay.querySelector("#pdf-nav-single").style.display = "none";
        rerender();
      });
      overlay.querySelector("#pdf-mode-single").addEventListener("click", function () {
        if (state.mode === "single") return;
        state.mode = "single";
        overlay.querySelector("#pdf-mode-single").classList.add("active");
        overlay.querySelector("#pdf-mode-scroll").classList.remove("active");
        overlay.querySelector("#pdf-nav-single").style.display = "flex";
        rerender();
      });

      // Single-page navigation
      overlay.querySelector("#pdf-prev").addEventListener("click", function () {
        if (state.currentPage > state.startPage) {
          state.currentPage--;
          renderSinglePage();
        }
      });
      overlay.querySelector("#pdf-next").addEventListener("click", function () {
        if (state.currentPage < state.endPage) {
          state.currentPage++;
          renderSinglePage();
        }
      });

      // Keyboard navigation for single mode
      document.addEventListener("keydown", function navHandler(e) {
        if (!overlay.parentNode) {
          document.removeEventListener("keydown", navHandler);
          return;
        }
        if (state.mode !== "single") return;
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          if (state.currentPage > state.startPage) {
            state.currentPage--;
            renderSinglePage();
          }
        } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          if (state.currentPage < state.endPage) {
            state.currentPage++;
            renderSinglePage();
          }
        }
      });

      function getContainerWidth() {
        return container.clientWidth - 48; // minus padding
      }

      function renderPage(num, appendTo) {
        state.pdfDoc.getPage(num).then(function (page) {
          // Get the natural viewport to calculate the base scale
          var naturalViewport = page.getViewport({ scale: 1.0 });
          var containerWidth = getContainerWidth();
          // Fit to container width, then apply user zoom
          var fitScale = containerWidth / naturalViewport.width;
          var finalScale = fitScale * state.scale;

          var viewport = page.getViewport({ scale: finalScale });
          var wrapper = document.createElement("div");
          wrapper.className = "pdf-page-wrapper";
          var canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          var pageLabel = document.createElement("div");
          pageLabel.className = "pdf-page-number";
          pageLabel.textContent = num + " / " + state.endPage;
          wrapper.appendChild(canvas);
          wrapper.appendChild(pageLabel);
          appendTo.appendChild(wrapper);
          page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport });
        });
      }

      function renderAllPages() {
        container.innerHTML = "";
        container.className = "pdf-overlay-body pdf-mode-scroll";
        for (var i = state.startPage; i <= state.endPage; i++) {
          renderPage(i, container);
        }
      }

      function renderSinglePage() {
        container.innerHTML = "";
        container.className = "pdf-overlay-body pdf-mode-single";
        renderPage(state.currentPage, container);
        overlay.querySelector("#pdf-current-page").textContent =
          state.currentPage + " / " + state.endPage;
      }

      function rerender() {
        if (!state.pdfDoc) return;
        if (state.mode === "scroll") {
          renderAllPages();
        } else {
          renderSinglePage();
        }
      }

      function loadAndRender() {
        Espo.Ajax.getRequest("CourseSectionPdf/" + self.sectionId + "/url")
          .then(function (data) {
            state.startPage = data.startPage || 1;
            state.endPage = data.endPage || 9999;
            state.currentPage = state.startPage;

            var xhr = new XMLHttpRequest();
            // Detect portal context and build correct API URL
            // In portal: /api/v1/portal-access/{PORTAL_ID}/CourseSectionPdf/ID/stream
            // In admin:  /api/v1/CourseSectionPdf/ID/stream
            var loc = window.location.pathname;
            var portalMatch = loc.match(/\/portal\/([^/]+)\//);
            var apiBase = portalMatch
              ? '/api/v1/portal-access/' + portalMatch[1] + '/'
              : '/api/v1/';
            var streamUrl = apiBase + 'CourseSectionPdf/' + self.sectionId + '/stream';
            xhr.open("GET", streamUrl, true);
            xhr.responseType = "arraybuffer";
            xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
            // Send same auth headers that Espo.Ajax uses internally
            // The auth string (base64 of username:token) is stored in localStorage
            var authString = localStorage.getItem('user-auth') || localStorage.getItem('auth');
            if (!authString) {
              // Try EspoCRM's storage format: key = "user" + "-" + "auth"
              try {
                for (var k = 0; k < localStorage.length; k++) {
                  var lsKey = localStorage.key(k);
                  if (lsKey && lsKey.indexOf('auth') !== -1) {
                    var val = localStorage.getItem(lsKey);
                    if (val && val.length > 20 && val.indexOf('{') === -1) {
                      authString = val;
                      break;
                    }
                  }
                }
              } catch(e) {}
            }
            if (authString) {
              xhr.setRequestHeader("Authorization", "Basic " + authString);
              xhr.setRequestHeader("Espo-Authorization", authString);
              xhr.setRequestHeader("Espo-Authorization-By-Token", "true");
            }

            xhr.onload = function () {
              if (xhr.status === 200) {
                self.ensurePdfjsLoaded(function () {
                  var typedArray = new Uint8Array(xhr.response);
                  window.pdfjsLib.getDocument({ data: typedArray }).promise.then(function (pdf) {
                    state.pdfDoc = pdf;
                    state.endPage = Math.min(state.endPage, pdf.numPages);
                    overlay.querySelector("#pdf-page-info").textContent = pdf.numPages + " pagine";
                    overlay.querySelector("#pdf-zoom-level").textContent = Math.round(state.scale * 100) + "%";
                    renderAllPages();
                  }).catch(function (err) {
                    console.error("PDF.js error:", err);
                    container.innerHTML =
                      '<div class="pdf-loading pdf-error"><i class="fas fa-exclamation-triangle"></i> Errore nel rendering del PDF</div>';
                  });
                });
              } else {
                container.innerHTML =
                  '<div class="pdf-loading pdf-error"><i class="fas fa-exclamation-triangle"></i> Errore ' + xhr.status + '</div>';
              }
            };
            xhr.onerror = function () {
              container.innerHTML =
                '<div class="pdf-loading pdf-error"><i class="fas fa-exclamation-triangle"></i> Errore di rete</div>';
            };
            xhr.send();
          })
          .catch(function () {
            container.innerHTML =
              '<div class="pdf-loading pdf-error"><i class="fas fa-exclamation-triangle"></i> Errore nel caricamento</div>';
          });
      }

      loadAndRender();
    },

    ensurePdfjsLoaded: function (callback) {
      if (window.pdfjsLib) {
        callback();
        return;
      }
      var script = document.createElement("script");
      script.src = "/client/custom/lib/pdf.min.js";
      script.onload = function () {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/client/custom/lib/pdf.worker.min.js";
          callback();
        }
      };
      script.onerror = function () {
        console.error("Failed to load PDF.js");
      };
      document.head.appendChild(script);
    },

    closeFullscreen: function (overlay) {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      document.body.style.overflow = "";
    },

    getStyles: function () {
      return [
        // Overlay
        "#pdf-fullscreen-overlay {",
        "  position:fixed; top:0; left:0; width:100vw; height:100vh;",
        "  z-index:100000; display:flex; align-items:center; justify-content:center;",
        "}",
        ".pdf-overlay-backdrop {",
        "  position:absolute; top:0; left:0; width:100%; height:100%;",
        "  background:rgba(0,0,0,0.88); backdrop-filter:blur(10px);",
        "}",
        // Container
        ".pdf-overlay-container {",
        "  position:relative; width:96vw; height:96vh;",
        "  background:#1a1a2e; border-radius:16px;",
        "  box-shadow:0 25px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08);",
        "  display:flex; flex-direction:column; overflow:hidden;",
        "}",
        // Header
        ".pdf-overlay-header {",
        "  display:flex; align-items:center; justify-content:space-between;",
        "  padding:12px 20px; background:linear-gradient(135deg,#16213e 0%,#0f3460 100%);",
        "  border-bottom:1px solid rgba(255,255,255,0.1); flex-shrink:0;",
        "}",
        ".pdf-header-title {",
        "  display:flex; align-items:center; gap:10px; color:#e8e8e8;",
        "  font-size:16px; font-weight:600;",
        "}",
        ".pdf-header-title i { color:#e94560; font-size:20px; }",
        ".pdf-header-controls {",
        "  display:flex; align-items:center; gap:6px; color:#ccc; font-size:13px;",
        "}",
        ".pdf-separator { color:rgba(255,255,255,0.15); margin:0 2px; }",
        // Buttons
        ".pdf-btn {",
        "  background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12);",
        "  color:#e8e8e8; width:34px; height:34px; border-radius:8px;",
        "  cursor:pointer; display:flex; align-items:center; justify-content:center;",
        "  transition:all 0.2s ease; font-size:13px;",
        "}",
        ".pdf-btn:hover { background:rgba(255,255,255,0.18); transform:scale(1.05); }",
        ".pdf-btn-close { background:rgba(233,69,96,0.2); border-color:rgba(233,69,96,0.3); }",
        ".pdf-btn-close:hover { background:rgba(233,69,96,0.4); }",
        // View toggle
        ".pdf-view-toggle { display:flex; gap:2px; background:rgba(0,0,0,0.3); border-radius:8px; padding:2px; }",
        ".pdf-view-btn { border:none; background:transparent; border-radius:6px; }",
        ".pdf-view-btn.active { background:rgba(233,69,96,0.5); border-color:rgba(233,69,96,0.6); }",
        // Single nav
        ".pdf-nav-single { display:flex; align-items:center; gap:6px; }",
        "#pdf-zoom-level { min-width:44px; text-align:center; font-weight:500; }",
        // Body - scroll mode
        ".pdf-overlay-body {",
        "  flex:1; overflow-y:auto; overflow-x:hidden; padding:24px;",
        "  display:flex; flex-direction:column; align-items:center; gap:12px;",
        "  background:#12121c;",
        "  scrollbar-width:thin; scrollbar-color:#333 transparent;",
        "}",
        ".pdf-overlay-body::-webkit-scrollbar { width:8px; }",
        ".pdf-overlay-body::-webkit-scrollbar-track { background:transparent; }",
        ".pdf-overlay-body::-webkit-scrollbar-thumb { background:#444; border-radius:4px; }",
        // Body - single mode
        ".pdf-mode-single {",
        "  justify-content:center; align-items:center;",
        "}",
        // Pages
        ".pdf-page-wrapper {",
        "  position:relative; background:#fff; border-radius:4px; overflow:hidden;",
        "  box-shadow:0 4px 24px rgba(0,0,0,0.5); flex-shrink:0;",
        "}",
        ".pdf-page-wrapper canvas {",
        "  display:block; user-select:none; -webkit-user-select:none;",
        "  pointer-events:none; max-width:100%;",
        "}",
        ".pdf-page-number {",
        "  position:absolute; bottom:8px; right:12px;",
        "  background:rgba(0,0,0,0.65); color:#fff; padding:3px 12px;",
        "  border-radius:12px; font-size:11px; font-weight:500;",
        "}",
        ".pdf-loading {",
        "  color:#888; font-size:16px; padding:60px;",
        "  display:flex; align-items:center; gap:12px;",
        "}",
        ".pdf-error { color:#e94560; }",
      ].join("\n");
    },
  });
});

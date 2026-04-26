define('custom:views/whatsapp/main-vue-container', ['view'], function (View) {

    return class extends View {

        templateContent = `
<div class="wa-vue-container" data-role="wa-vue-container">
    <div id="wa-vue-app-root" data-role="wa-vue-root">
        <div class="alert alert-info" style="margin: 12px;">
            <strong>WhatsApp</strong>
            Loading...
        </div>
    </div>
</div>
`;

        setup() {
            this.vueApp = null;
            this.vueAssetVersion = '2026.04.25.02';
        }

        afterRender() {
            this.loadVueAssets()
                .then(() => {
                    const init = window.initWhatsAppVueApp ||
                        (window.WhatsAppVueBundle && window.WhatsAppVueBundle.initWhatsAppVueApp);

                    if (!init) {
                        throw new Error('window.initWhatsAppVueApp is not available.');
                    }

                    this.vueApp = init(
                        this.el.querySelector('[data-role="wa-vue-root"]'),
                        this.getEspoContext()
                    );
                })
                .catch(error => {
                    console.error('WhatsApp Vue container failed to initialize.', error);
                    this.showLoadError(error);
                });
        }

        onRemove() {
            if (this.vueApp && typeof this.vueApp.unmount === 'function') {
                this.vueApp.unmount();
            }

            this.vueApp = null;
        }

        getEspoContext() {
            const user = typeof this.getUser === 'function' ? this.getUser() : null;
            const config = typeof this.getConfig === 'function' ? this.getConfig() : null;
            const storage = typeof this.getStorage === 'function' ? this.getStorage() : null;

            return {
                scope: 'WhatsApp',
                userId: user && user.id ? user.id : null,
                ajax: window.Espo ? window.Espo.Ajax : null,
                router: typeof this.getRouter === 'function' ? this.getRouter() : null,
                config: config,
                storage: storage,
                initialChatId: this.getInitialRouteParam('chatId'),
                initialPhoneNumber: this.getInitialRouteParam('phoneNumber') || this.getInitialRouteParam('phone'),
            };
        }

        getInitialRouteParam(name) {
            const hash = window.location.hash || '';
            const queryIndex = hash.indexOf('?');

            if (queryIndex === -1) {
                return '';
            }

            const query = hash.slice(queryIndex + 1);
            const params = new URLSearchParams(query);
            const value = params.get(name) || '';

            return value.charAt(0) === ' ' ? '+' + value.trimStart() : value;
        }

        loadVueAssets() {
            this.ensureStyle(
                'wa-vue-app-styles',
                'client/custom/js/whatsapp-vue.css?v=' + this.vueAssetVersion,
                this.vueAssetVersion
            );

            return this.ensureScript(
                'wa-vue-app-bundle',
                'client/custom/js/whatsapp-vue.bundle.js?v=' + this.vueAssetVersion,
                this.vueAssetVersion
            );
        }

        ensureStyle(id, href, version) {
            const existing = document.getElementById(id);

            if (existing) {
                if (existing.getAttribute('href') !== href) {
                    existing.setAttribute('href', href);
                }

                existing.dataset.version = version;
                return;
            }

            const link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.href = href;
            link.dataset.version = version;
            document.head.appendChild(link);
        }

        ensureScript(id, src, version) {
            return new Promise((resolve, reject) => {
                const hasCurrentInit = window.__WhatsAppVueAssetVersion === version &&
                    (window.initWhatsAppVueApp ||
                        (window.WhatsAppVueBundle && window.WhatsAppVueBundle.initWhatsAppVueApp));

                if (hasCurrentInit) {
                    resolve();
                    return;
                }

                const existing = document.getElementById(id);

                if (existing) {
                    if (existing.dataset.version !== version || existing.dataset.loaded === 'true') {
                        existing.remove();
                    } else {
                        existing.addEventListener('load', () => resolve(), {once: true});
                        existing.addEventListener('error', () => reject(new Error('Failed to load ' + src)), {once: true});
                        return;
                    }
                }

                window.initWhatsAppVueApp = null;
                window.WhatsAppVueBundle = null;

                const current = document.getElementById(id);

                if (current) {
                    current.addEventListener('load', () => resolve(), {once: true});
                    current.addEventListener('error', () => reject(new Error('Failed to load ' + src)), {once: true});
                    return;
                }

                const script = document.createElement('script');
                script.id = id;
                script.src = src;
                script.async = true;
                script.dataset.version = version;
                script.onload = () => {
                    script.dataset.loaded = 'true';
                    window.__WhatsAppVueAssetVersion = version;
                    resolve();
                };
                script.onerror = () => reject(new Error('Failed to load ' + src));
                document.head.appendChild(script);
            });
        }

        showLoadError(error) {
            const container = this.el.querySelector('[data-role="wa-vue-root"]');

            if (!container) {
                return;
            }

            container.innerHTML = `
<div class="alert alert-danger">
    <strong>WhatsApp Vue UI failed to load.</strong>
    <div>${this.escapeHtml(error && error.message ? error.message : 'Unknown error')}</div>
</div>
`;
        }

        escapeHtml(value) {
            const element = document.createElement('div');
            element.textContent = String(value || '');

            return element.innerHTML;
        }
    };
});

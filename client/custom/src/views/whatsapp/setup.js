define('custom:views/whatsapp/setup', ['view', 'model'], function (View, Model) {

    return class extends View {

        templateContent = `
<div class="header-page">
    <h3>Integrazione WhatsApp</h3>
</div>

<div class="record">
    <div class="panel panel-default">
        <div class="panel-heading">
            <h4 class="panel-title">Connessione</h4>
        </div>
        <div class="panel-body">
            <div class="row">
                <div class="col-md-12">
                    <div class="form-group">
                        <label class="control-label" data-name="whatsappEnabled">Abilita integrazione WhatsApp</label>
                        <div class="field" data-name="whatsappEnabled">
                            {{{whatsappEnabled}}}
                        </div>
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-md-6">
                    <div class="form-group">
                        <label class="control-label" data-name="whatsappApiUrl">URL API WhatsApp</label>
                        <div class="field" data-name="whatsappApiUrl">
                            {{{whatsappApiUrl}}}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-group">
                        <label class="control-label" data-name="whatsappApiKey">Chiave API WhatsApp</label>
                        <div class="field" data-name="whatsappApiKey">
                            {{{whatsappApiKey}}}
                        </div>
                        <div class="btn-group btn-group-sm" style="margin-top: 8px;">
                            <button type="button" class="btn btn-default action" data-action="generateApiKey">
                                Genera chiave
                            </button>
                        </div>
                        <p class="help-block small">
                            Questa chiave deve essere identica alla variabile <code>API_KEY</code>
                            del container bridge WhatsApp. Usa solo URL di rete Docker interna,
                            per esempio <code>http://whatsapp-api:3000</code>; non esporre il webhook
                            no-auth su Internet.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="panel panel-default">
        <div class="panel-heading">
            <h4 class="panel-title">Dialoghi e automazione</h4>
        </div>
        <div class="panel-body">
            <div class="row">
                <div class="col-md-6">
                    <div class="form-group">
                        <label class="control-label" data-name="whatsappConversationTimeoutMinutes">Timeout dialogo (minuti)</label>
                        <div class="field" data-name="whatsappConversationTimeoutMinutes">
                            {{{whatsappConversationTimeoutMinutes}}}
                        </div>
                        <p class="help-block small">Tempo massimo di apertura automatica del dialogo prima della chiusura.</p>
                    </div>
                </div>
                <div class="col-md-12">
                     <div class="form-group">
                        <label class="control-label" data-name="whatsappAutoMessageEnabled">Abilita messaggio automatico di benvenuto</label>
                        <div class="field" data-name="whatsappAutoMessageEnabled">
                            {{{whatsappAutoMessageEnabled}}}
                        </div>
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-md-12">
                    <div class="form-group">
                        <label class="control-label" data-name="whatsappLeadTemplate">Template messaggio</label>
                        <div class="field" data-name="whatsappLeadTemplate">
                            {{{whatsappLeadTemplate}}}
                        </div>
                        <p class="help-block small">Placeholder disponibili: {name}, {company}, {source}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="button-container">
        <button type="button" class="btn btn-primary action" data-action="save">Salva</button>
        <button type="button" class="btn btn-default action" data-action="cancel">Annulla</button>
    </div>
</div>
`;

        events = {
            'click [data-action="save"]': 'actionSave',
            'click [data-action="cancel"]': 'actionCancel',
            'click [data-action="generateApiKey"]': 'actionGenerateApiKey'
        };

        setup() {
            this.model = new Model();
            this.model.name = 'Settings';

            this.createField('whatsappApiUrl', 'url');
            this.createField('whatsappApiKey', 'varchar');
            this.createField('whatsappEnabled', 'bool');
            this.createField('whatsappConversationTimeoutMinutes', 'int');
            this.createField('whatsappAutoMessageEnabled', 'bool');
            this.createField('whatsappLeadTemplate', 'text');

            this.wait(this.loadData());
        }

        createField(name, type) {
            this.createView(name, 'views/fields/' + type, {
                name: name,
                model: this.model,
                mode: 'edit',
                labelText: this.translate(name, 'fields', 'Settings')
            });
        }

        async loadData() {
            try {
                const data = await Espo.Ajax.getRequest('Settings');
                this.model.set(data);
                const timeoutSeconds = parseInt(data.whatsappConversationTimeoutSeconds || 1200, 10);
                this.model.set('whatsappConversationTimeoutMinutes', Math.max(1, Math.round(timeoutSeconds / 60)));
            } catch (e) {
                console.error('Failed to load settings', e);
                Espo.Ui.error('Failed to load settings');
            }
        }

        async actionSave() {
            Espo.Ui.notify('Saving...');

            const data = this.model.attributes;
            const payload = {
                whatsappEnabled: data.whatsappEnabled,
                whatsappApiUrl: data.whatsappApiUrl,
                whatsappApiKey: data.whatsappApiKey,
                whatsappConversationTimeoutSeconds: Math.max(1, parseInt(data.whatsappConversationTimeoutMinutes || 20, 10)) * 60,
                whatsappAutoMessageEnabled: data.whatsappAutoMessageEnabled,
                whatsappLeadTemplate: data.whatsappLeadTemplate
            };

            try {
                await Espo.Ajax.postRequest('WhatsApp/action/saveSettings', payload);
                Espo.Ui.success(this.translate('Saved'));
            } catch (e) {
                console.error('Save failed', e);
                let msg = 'Error';

                if (e.response) {
                    if (e.response.status === 404) {
                        msg = '404 Not Found (Check Routes)';
                    } else if (e.response.status === 500) {
                        msg = '500 Server Error: ' + (e.response.statusText || 'Internal Error');

                        if (e.response.responseJSON && e.response.responseJSON.message) {
                            msg += ' - ' + e.response.responseJSON.message;
                        } else if (e.response.responseText) {
                            console.error('Response Text:', e.response.responseText);
                        }
                    }
                }

                Espo.Ui.error(msg);
            }
        }

        actionGenerateApiKey() {
            let key;

            try {
                key = this.generateApiKey();
            } catch (e) {
                Espo.Ui.error(e.message || 'Web Crypto API is not available.');

                return;
            }

            this.model.set('whatsappApiKey', key);

            const fieldView = this.getView('whatsappApiKey');

            if (fieldView && typeof fieldView.reRender === 'function') {
                fieldView.reRender();
            }

            Espo.Ui.success('API key generated. Save settings and set the same API_KEY in the WhatsApp bridge container.');
        }

        generateApiKey() {
            if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') {
                throw new Error('Web Crypto API is not available. Open EspoCRM over HTTPS and try again.');
            }

            const bytes = new Uint8Array(32);

            window.crypto.getRandomValues(bytes);

            return Array.from(bytes)
                .map(value => value.toString(16).padStart(2, '0'))
                .join('');
        }

        actionCancel() {
            this.getRouter().navigate('#Admin', {trigger: true});
        }
    };
});

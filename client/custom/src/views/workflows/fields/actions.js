define('custom:views/workflows/fields/actions', [
    'views/fields/base'
], function (BaseView) {

    return class extends BaseView {

        editTemplateContent = `
<div class="workflow-actions">
    <div class="workflow-actions-list-container list-group">
        {{#each itemDataList}}
        <div class="list-group-item">
            <div class="clearfix">
                <div class="pull-right">
                    <a
                        role="button"
                        tabindex="0"
                        data-action="removeAction"
                        data-index="{{index}}"
                        title="{{translate 'Remove'}}"
                    ><span class="fas fa-minus fa-sm"></span></a>
                </div>
                <div class="pull-left">
                    <strong>{{label}}</strong>
                </div>
            </div>
            <div class="small text-muted" style="margin-top: 6px;">{{summary}}</div>
            <div style="margin-top: 8px;">
                <a
                    role="button"
                    tabindex="0"
                    data-action="editAction"
                    data-index="{{index}}"
                >{{translate 'Edit'}}</a>
            </div>
        </div>
        {{/each}}
    </div>
    <div>
        <a
            role="button"
            tabindex="0"
            data-action="showAddModal"
            title="{{translate 'Add'}}"
        ><span class="fas fa-plus fa-sm"></span></a>
    </div>
</div>
`;

        detailTemplateContent = `
{{#if itemDataList.length}}
    <div class="workflow-actions-list-container list-group">
        {{#each itemDataList}}
        <div class="list-group-item">
            <div><strong>{{label}}</strong></div>
            <div class="small text-muted" style="margin-top: 6px;">{{summary}}</div>
        </div>
        {{/each}}
    </div>
{{else}}
    {{#if valueIsSet}}
        <span class="none-value">{{translate 'None'}}</span>
    {{else}}
        <span class="loading-value"></span>
    {{/if}}
{{/if}}
`;

        setup() {
            super.setup();

            this.addActionHandler('showAddModal', () => this.actionAddItem());
            this.addActionHandler('editAction', (e, target) => this.editAction(parseInt(target.dataset.index)));
            this.addActionHandler('removeAction', (e, target) => this.removeAction(parseInt(target.dataset.index)));

            this.actionConfigList = this.normalizeActionConfigList(this.model.get(this.name));
            this.availableActionList =
                this.params.options ||
                this.options.options ||
                this.getMetadata().get(['entityDefs', this.model.entityType, 'fields', this.name, 'options']) ||
                [];
        }

        data() {
            return {
                ...super.data(),
                itemDataList: this.getItemDataList(),
                valueIsSet: this.model.has(this.name),
            };
        }

        async actionAddItem() {
            await this.createView('dialog', 'views/modals/array-field-add', {
                options: this.availableActionList,
                translatedOptions: this.getTranslatedOptions(),
            }, view => {
                view.render();

                this.listenToOnce(view, 'add', value => {
                    view.close();

                    setTimeout(() => this.addAction(value), 0);
                });

                this.listenToOnce(view, 'add-mass', valueList => {
                    view.close();

                    valueList.forEach(value => this.addAction(value, false));
                });
            });
        }

        addAction(value, openEditor = true) {
            const config = this.createDefaultActionConfig(value);

            if (!config) {
                return;
            }

            const index = this.actionConfigList.length;

            this.actionConfigList.push(config);
            this.reRender();
            this.trigger('change');

            if (openEditor) {
                this.editAction(index, true);
            }
        }

        removeAction(index) {
            if (!this.actionConfigList[index]) {
                return;
            }

            this.actionConfigList.splice(index, 1);
            this.reRender();
            this.trigger('change');
        }

        async editAction(index, isNew = false) {
            const actionConfig = this.actionConfigList[index];

            if (!actionConfig) {
                return;
            }

            await this.createView('dialog', 'custom:views/workflows/modals/edit-action', {
                actionConfig: Espo.Utils.cloneDeep(actionConfig),
                translatedLabel: this.translateActionLabel(actionConfig),
            }, view => {
                view.render();

                this.listenToOnce(view, 'apply', updatedActionConfig => {
                    this.actionConfigList[index] = updatedActionConfig;
                    this.reRender();
                    this.trigger('change');
                });

                if (isNew) {
                    this.listenToOnce(view, 'dialog:close', () => {
                        if (!this.actionConfigList[index]) {
                            return;
                        }

                        const currentConfig = this.actionConfigList[index];

                        if (!this.hasMeaningfulPayload(currentConfig)) {
                            this.actionConfigList.splice(index, 1);
                            this.reRender();
                            this.trigger('change');
                        }
                    });
                }
            });
        }

        fetch() {
            const data = {};

            data[this.name] = this.actionConfigList.length ? this.actionConfigList : null;

            return data;
        }

        getItemDataList() {
            return this.actionConfigList.map((item, index) => ({
                index: index,
                label: this.translateActionLabel(item),
                summary: this.getActionSummary(item),
            }));
        }

        getTranslatedOptions() {
            const map = {};

            this.availableActionList.forEach(value => {
                map[value] = this.getLanguage().translateOption(value, this.name, this.scope);
            });

            return map;
        }

        translateActionLabel(item) {
            const key = this.getActionKey(item);

            return this.getLanguage().translateOption(key, this.name, this.scope) || key;
        }

        getActionSummary(item) {
            const key = this.getActionKey(item);
            const payload = item.payload || {};

            switch (key) {
                case 'record.create_record': {
                    const entityType = payload.entityType || this.translate('None');
                    const fieldCount = Array.isArray(payload.attributes) ? payload.attributes.length : 0;

                    return `${this.translate('Target', 'labels', 'WorkflowDefinition')}: ${this.translate(entityType, 'scopeNames')} | ${this.translate('Fields', 'labels', 'WorkflowDefinition')}: ${fieldCount}`;
                }

                case 'record.update_record': {
                    const entityType = payload.entityType || this.translate('None');
                    const fieldCount = Array.isArray(payload.attributes) ? payload.attributes.length : 0;
                    const recordId = payload.id || this.translate('None');

                    return `${this.translate('Target', 'labels', 'WorkflowDefinition')}: ${this.translate(entityType, 'scopeNames')} #${recordId} | ${this.translate('Fields', 'labels', 'WorkflowDefinition')}: ${fieldCount}`;
                }

                case 'record.assign_owner': {
                    const entityType = payload.entityType || this.translate('None');
                    const recordId = payload.id || this.translate('None');
                    const userName = payload.assignedUserName || payload.assignedUserId || this.translate('None');

                    return `${this.translate('Target', 'labels', 'WorkflowDefinition')}: ${this.translate(entityType, 'scopeNames')} #${recordId} | ${this.translate('Assigned User', 'fields', 'WorkflowDefinition')}: ${userName}`;
                }

                case 'whatsapp.send_message': {
                    const waId = payload.chatId || payload.waId || this.translate('None');
                    const body = payload.body || payload.message || '';

                    return `${waId}${body ? ' | ' + body : ''}`;
                }

                case 'email.send_email': {
                    const to = payload.to || this.translate('None');
                    const subject = payload.subject || '';

                    return `${to}${subject ? ' | ' + subject : ''}`;
                }

                default:
                    return this.translate('Configuration available in editor', 'messages', 'WorkflowDefinition');
            }
        }

        normalizeActionConfigList(value) {
            if (!Array.isArray(value)) {
                return [];
            }

            return value.map(item => {
                if (typeof item === 'string') {
                    return this.createDefaultActionConfig(item);
                }

                if (!item || typeof item !== 'object') {
                    return null;
                }

                return {
                    provider: (item.provider || '').toString(),
                    action: (item.action || '').toString(),
                    payload: Espo.Utils.cloneDeep(item.payload || {}),
                };
            }).filter(Boolean);
        }

        createDefaultActionConfig(value) {
            const normalized = (value || '').toString().trim();

            if (!normalized) {
                return null;
            }

            const parts = normalized.split('.');
            const provider = parts[0] || '';
            const action = parts[1] || '';

            if (!provider || !action) {
                return null;
            }

            return {
                provider: provider,
                action: action,
                payload: this.getDefaultPayload(provider + '.' + action),
            };
        }

        getDefaultPayload(key) {
            switch (key) {
                case 'record.create_record':
                    return {
                        entityType: '',
                        attributes: [],
                    };

                case 'record.update_record':
                    return {
                        entityType: '',
                        id: '',
                        attributes: [],
                    };

                case 'record.assign_owner':
                    return {
                        entityType: '',
                        id: '',
                        assignedUserId: '',
                        assignedUserName: '',
                    };

                case 'whatsapp.send_message':
                    return {
                        waId: '',
                        body: '',
                    };

                case 'email.send_email':
                    return {
                        to: '',
                        subject: '',
                        body: '',
                    };

                default:
                    return {};
            }
        }

        getActionKey(item) {
            return `${item.provider}.${item.action}`;
        }

        hasMeaningfulPayload(item) {
            const payload = item?.payload || {};
            const key = this.getActionKey(item);

            switch (key) {
                case 'record.create_record':
                    return !!payload.entityType && Array.isArray(payload.attributes) && payload.attributes.length > 0;

                case 'record.update_record':
                    return !!payload.entityType && !!payload.id && Array.isArray(payload.attributes) && payload.attributes.length > 0;

                case 'record.assign_owner':
                    return !!payload.entityType && !!payload.id && !!payload.assignedUserId;

                case 'whatsapp.send_message':
                    return !!(payload.waId || payload.chatId) && !!(payload.body || payload.message);

                case 'email.send_email':
                    return !!payload.to && !!payload.subject;

                default:
                    return Object.keys(payload).length > 0;
            }
        }
    };
});

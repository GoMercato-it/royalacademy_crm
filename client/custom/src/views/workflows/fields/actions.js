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

            this.workflowScope =
                this.model.entityType ||
                this.model.name ||
                this.scope ||
                'WorkflowDefinition';
            this.actionConfigList = this.normalizeActionConfigList(this.model.get(this.name));
            this.availableActionList =
                this.params.options ||
                this.options.options ||
                this.getMetadata().get(['entityDefs', this.workflowScope, 'fields', this.name, 'options']) ||
                this.getMetadata().get(['entityDefs', 'WorkflowDefinition', 'fields', this.name, 'options']) ||
                this.getDefaultActionOptionList() ||
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
                workflowEntityType: this.model.get('entityType') || '',
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
                map[value] = this.getLanguage().translateOption(value, this.name, this.workflowScope);
            });

            return map;
        }

        translateActionLabel(item) {
            const key = this.getActionKey(item);

            return this.getLanguage().translateOption(key, this.name, this.workflowScope) || key;
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

                case 'record.create_task':
                case 'record.create_meeting': {
                    const entityType = this.getFixedTargetEntityType(key);
                    const fieldCount = Array.isArray(payload.attributes) ? payload.attributes.length : 0;

                    return `${this.translate('Target', 'labels', 'WorkflowDefinition')}: ${this.translate(entityType, 'scopeNames')} | ${this.translate('Fields', 'labels', 'WorkflowDefinition')}: ${fieldCount}`;
                }

                case 'record.update_record': {
                    const entityType = payload.entityType || this.translate('None');
                    const fieldCount = Array.isArray(payload.attributes) ? payload.attributes.length : 0;
                    const recordId = this.summarizeValueConfig(payload.id) || this.translate('None');

                    return `${this.translate('Target', 'labels', 'WorkflowDefinition')}: ${this.translate(entityType, 'scopeNames')} #${recordId} | ${this.translate('Fields', 'labels', 'WorkflowDefinition')}: ${fieldCount}`;
                }

                case 'record.assign_owner': {
                    const entityType = payload.entityType || this.translate('None');
                    const recordId = this.summarizeValueConfig(payload.id) || this.translate('None');
                    const userName = this.summarizeValueConfig(payload.assignedUserId || payload.ownerUserId) || this.translate('None');

                    return `${this.translate('Target', 'labels', 'WorkflowDefinition')}: ${this.translate(entityType, 'scopeNames')} #${recordId} | ${this.translate('Assigned User', 'fields', 'WorkflowDefinition')}: ${userName}`;
                }

                case 'whatsapp.send_message': {
                    const waId = this.summarizeValueConfig(payload.chatId || payload.waId || payload.phone) || this.translate('None');
                    const body = this.summarizeValueConfig(payload.body || payload.message || payload.text) || '';

                    return `${waId}${body ? ' | ' + body : ''}`;
                }

                case 'email.send_email': {
                    const to = this.summarizeValueConfig(payload.to) || this.translate('None');
                    const subject = this.summarizeValueConfig(payload.subject) || '';

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

        summarizeValueConfig(value) {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                return value || '';
            }

            const sourceType = value.sourceType || (value.sourceField ? 'field' : value.expression ? 'expression' : 'constant');

            if (sourceType === 'field') {
                return `${this.translate('Source Field', 'fields', 'WorkflowDefinition')}: ${value.sourceField || ''}`;
            }

            if (sourceType === 'expression') {
                return `${this.translate('Expression', 'fields', 'WorkflowDefinition')}: ${value.expression || ''}`;
            }

            return value.value || '';
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

        getDefaultActionOptionList() {
            return [
                'record.create_record',
                'record.create_task',
                'record.create_meeting',
                'record.update_record',
                'record.assign_owner',
                'email.send_email',
                'email.queue_email',
                'email.send_template',
                'whatsapp.send_message',
                'whatsapp.schedule_follow_up',
                'whatsapp.link_chat_to_entity',
                'whatsapp.assign_conversation_owner',
                'whatsapp.close_conversation',
            ];
        }

        getDefaultPayload(key) {
            switch (key) {
                case 'record.create_record':
                    return {
                        entityType: '',
                        attributes: [],
                    };

                case 'record.create_task':
                    return {
                        entityType: 'Task',
                        attributes: [],
                    };

                case 'record.create_meeting':
                    return {
                        entityType: 'Meeting',
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
                case 'record.create_task':
                case 'record.create_meeting':
                    return !!payload.entityType && Array.isArray(payload.attributes) && payload.attributes.length > 0;

                case 'record.update_record':
                    return !!payload.entityType &&
                        this.hasMeaningfulValue(payload.id) &&
                        Array.isArray(payload.attributes) &&
                        payload.attributes.length > 0;

                case 'record.assign_owner':
                    return !!payload.entityType &&
                        this.hasMeaningfulValue(payload.id) &&
                        this.hasMeaningfulValue(payload.assignedUserId);

                case 'whatsapp.send_message':
                    return this.hasMeaningfulValue(payload.waId || payload.chatId) &&
                        this.hasMeaningfulValue(payload.body || payload.message);

                case 'email.send_email':
                    return this.hasMeaningfulValue(payload.to) &&
                        this.hasMeaningfulValue(payload.subject);

                default:
                    return Object.keys(payload).length > 0;
            }
        }

        hasMeaningfulValue(value) {
            if (value === null || value === undefined) {
                return false;
            }

            if (typeof value !== 'object' || Array.isArray(value)) {
                return value !== '';
            }

            const sourceType = value.sourceType || (value.sourceField ? 'field' : value.expression ? 'expression' : 'constant');

            if (sourceType === 'field') {
                return !!value.sourceField;
            }

            if (sourceType === 'expression') {
                return !!value.expression;
            }

            return value.value !== '' && value.value !== null && value.value !== undefined;
        }

        getFixedTargetEntityType(key) {
            if (key === 'record.create_task') {
                return 'Task';
            }

            if (key === 'record.create_meeting') {
                return 'Meeting';
            }

            return '';
        }
    };
});

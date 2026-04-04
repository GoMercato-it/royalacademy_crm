define('custom:views/workflows/fields/value-config-v4', [
    'views/fields/base',
    'custom:workflows/field-catalog'
], function (BaseView, FieldCatalog) {

    return class extends BaseView {

        editTemplateContent = `
<div class="workflow-value-config">
    <div class="small text-muted">{{summary}}</div>
    <div style="margin-top: 6px;">
        <a
            role="button"
            tabindex="0"
            data-action="editValue"
        >{{translate 'Edit'}}</a>
    </div>
</div>
`;

        detailTemplateContent = `
<div class="workflow-value-config-detail small text-muted">{{summary}}</div>
`;

        setup() {
            super.setup();

            this.sourceEntityType = this.options.sourceEntityType || this.params.sourceEntityType || '';
            this.targetEntityType = this.options.targetEntityType || this.params.targetEntityType || '';
            this.targetFieldAttribute = this.options.targetFieldAttribute || this.params.targetFieldAttribute || '';
            this.valueType = this.options.valueType || this.params.valueType || 'varchar';
            this.valueOptions = this.options.valueOptions || this.params.valueOptions || [];
            this.translatedValueOptions = this.options.translatedValueOptions || this.params.translatedValueOptions || {};
            this.constantFieldDefs = this.options.fieldDefs || this.params.fieldDefs || null;
            this.headerText = this.options.headerText || this.params.headerText || this.translate(this.name, 'fields', 'WorkflowDefinition');
            this.fieldCatalog = new FieldCatalog(this);

            this.refreshDynamicFieldConfig();
            this.valueConfig = this.normalizeValueConfig(this.model.get(this.name));

            this.listenTo(this.model, `change:${this.name}`, () => {
                this.valueConfig = this.normalizeValueConfig(this.model.get(this.name));

                if (this.isRendered()) {
                    this.reRender();
                }
            });

            if (this.targetFieldAttribute) {
                this.listenTo(this.model, `change:${this.targetFieldAttribute}`, () => {
                    this.refreshDynamicFieldConfig();

                    if (this.isRendered()) {
                        this.reRender();
                    }
                });
            }

            this.addActionHandler('editValue', () => this.editValue());
        }

        data() {
            return {
                ...super.data(),
                summary: this.getSummary(),
            };
        }

        editValue() {
            this.refreshDynamicFieldConfig();

            this.createView('dialog', 'custom:views/workflows/modals/edit-value-config-v4', {
                valueConfig: Espo.Utils.cloneDeep(this.valueConfig),
                sourceEntityType: this.sourceEntityType,
                valueType: this.valueType,
                valueOptions: this.valueOptions,
                translatedValueOptions: this.translatedValueOptions,
                fieldDefs: this.constantFieldDefs,
                headerText: this.headerText,
            }, view => {
                view.render();

                this.listenToOnce(view, 'apply', valueConfig => {
                    this.valueConfig = valueConfig;
                    this.model.set(this.name, valueConfig);
                    this.reRender();
                    this.trigger('change');
                });
            });
        }

        fetch() {
            const data = {};

            data[this.name] = this.valueConfig;

            return data;
        }

        normalizeValueConfig(valueConfig) {
            if (valueConfig && typeof valueConfig === 'object' && !Array.isArray(valueConfig)) {
                return {
                    sourceType: valueConfig.sourceType || (valueConfig.sourceField ? 'field' : valueConfig.expression ? 'expression' : 'constant'),
                    value: valueConfig.value ?? '',
                    sourceField: valueConfig.sourceField || '',
                    expression: valueConfig.expression || '',
                };
            }

            return {
                sourceType: 'constant',
                value: valueConfig ?? '',
                sourceField: '',
                expression: '',
            };
        }

        getSummary() {
            const sourceType = this.valueConfig.sourceType || 'constant';

            if (sourceType === 'field') {
                return `${this.translate('Source Field', 'fields', 'WorkflowDefinition')}: ${this.translateSourceField(this.valueConfig.sourceField || '')}`;
            }

            if (sourceType === 'expression') {
                return `${this.translate('Expression', 'fields', 'WorkflowDefinition')}: ${this.valueConfig.expression || ''}`;
            }

            return this.formatConstantValue(this.valueConfig.value);
        }

        refreshDynamicFieldConfig() {
            if (!this.targetEntityType || !this.targetFieldAttribute) {
                return;
            }

            const targetField = this.model.get(this.targetFieldAttribute) || '';
            const fieldDefs = this.fieldCatalog.getTargetValueFieldDefs(this.targetEntityType, targetField);

            this.constantFieldDefs = fieldDefs;
            this.valueType = fieldDefs.type || 'varchar';
            this.valueOptions = fieldDefs.options || [];
            this.translatedValueOptions = fieldDefs.translatedOptions || {};

            if (targetField) {
                this.headerText = this.fieldCatalog.getTargetFieldLabel(this.targetEntityType, targetField) ||
                    this.headerText;
            }
        }

        formatConstantValue(value) {
            if (value === null || value === undefined || value === '') {
                return this.translate('None');
            }

            if (value && typeof value === 'object' && !Array.isArray(value)) {
                return value.name || value.id || this.translate('None');
            }

            if (this.valueType === 'bool') {
                return value ? this.translate('Yes') : this.translate('No');
            }

            if ((this.valueType === 'enum' || this.valueType === 'multiEnum' || this.valueType === 'checklist') && !Array.isArray(value)) {
                return this.translatedValueOptions[value] || value;
            }

            if ((this.valueType === 'multiEnum' || this.valueType === 'checklist') && Array.isArray(value)) {
                return value.map(item => this.translatedValueOptions[item] || item).join(', ');
            }

            return value.toString();
        }

        translateSourceField(name) {
            return this.fieldCatalog.translateSourceField(this.sourceEntityType, name);
        }
    };
});

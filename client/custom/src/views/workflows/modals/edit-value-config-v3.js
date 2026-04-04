define('custom:views/workflows/modals/edit-value-config-v3', [
    'views/modal',
    'custom:workflows/field-catalog',
    'model'
], function (ModalView, FieldCatalog, Model) {

    return class extends ModalView {

        className = 'dialog dialog-record';
        templateContent = '<div class="workflow-value-config-modal"></div>';

        events = {
            'change [data-name="sourceType"]': function (e) {
                this.captureCurrentDomValues();
                this.state.sourceType = e.currentTarget.value || 'constant';
                this.renderContent();
            }
        };

        setup() {
            super.setup();

            this.sourceEntityType = this.options.sourceEntityType || '';
            this.valueType = this.options.valueType || 'varchar';
            this.valueOptions = this.options.valueOptions || [];
            this.translatedValueOptions = this.options.translatedValueOptions || {};
            this.constantFieldDefs = this.options.fieldDefs || null;
            this.headerText = this.options.headerText || this.translate('Value', 'fields', 'WorkflowDefinition');
            this.fieldCatalog = new FieldCatalog(this);
            this.state = this.normalizeValueConfig(this.options.valueConfig);
            this.expressionModel = new Model();
            this.expressionModel.set('expression', this.state.expression || '', {silent: true});

            this.buttonList = [
                {
                    name: 'apply',
                    label: 'Apply',
                    style: 'danger'
                },
                {
                    name: 'cancel',
                    label: 'Cancel'
                }
            ];
            this.shortcutKeys = {
                'Control+Enter': () => this.actionApply()
            };
        }

        afterRender() {
            super.afterRender();
            this.renderContent();
        }

        actionApply() {
            this.captureCurrentDomValues();

            if (this.state.sourceType === 'field' && !this.state.sourceField) {
                Espo.Ui.warning(this.translate('selectSourceFieldFirst', 'messages', 'WorkflowDefinition'));

                return;
            }

            this.trigger('apply', {
                sourceType: this.state.sourceType || 'constant',
                value: this.getResultValue(),
                sourceField: this.state.sourceField || '',
                expression: this.state.expression || '',
            });

            this.close();
        }

        renderContent() {
            const container = this.$el.find('.workflow-value-config-modal');

            if (!container.length) {
                return;
            }

            if (this.hasView('expressionField')) {
                this.clearView('expressionField');
            }

            container.html(this.buildContentHtml());

            if ((this.state.sourceType || 'constant') === 'expression') {
                this.renderExpressionField();
            }
        }

        buildContentHtml() {
            const sourceType = this.state.sourceType || 'constant';

            return `
                <div class="panel panel-default" style="margin-bottom: 0;">
                    <div class="panel-body">
                        <div class="form-group">
                            <label class="control-label">${this.escapeHtml(this.translate('Value Source', 'fields', 'WorkflowDefinition'))}</label>
                            <select class="form-control" data-name="sourceType">
                                ${this.getSourceTypeOptionsHtml()}
                            </select>
                        </div>
                        ${sourceType === 'constant' ? this.getConstantSectionHtml() : ''}
                        ${sourceType === 'field' ? this.getSourceFieldSectionHtml() : ''}
                        ${sourceType === 'expression' ? this.getExpressionSectionHtml() : ''}
                    </div>
                </div>
            `;
        }

        getSourceTypeOptionsHtml() {
            const options = [
                {
                    value: 'constant',
                    label: this.translate('Raw Text', 'labels', 'WorkflowDefinition')
                },
                {
                    value: 'field',
                    label: this.translate('Source Field', 'fields', 'WorkflowDefinition')
                },
                {
                    value: 'expression',
                    label: this.translate('Expression', 'fields', 'WorkflowDefinition')
                }
            ];

            return options.map(item => {
                const selected = item.value === (this.state.sourceType || 'constant') ? ' selected' : '';

                return `<option value="${this.escapeHtml(item.value)}"${selected}>${this.escapeHtml(item.label)}</option>`;
            }).join('');
        }

        getConstantSectionHtml() {
            return `
                <div class="form-group">
                    <label class="control-label">${this.escapeHtml(this.translate('Value', 'fields', 'WorkflowDefinition'))}</label>
                    ${this.getConstantInputHtml()}
                </div>
            `;
        }

        getSourceFieldSectionHtml() {
            return `
                <div class="form-group">
                    <label class="control-label">${this.escapeHtml(this.translate('Source Field', 'fields', 'WorkflowDefinition'))}</label>
                    <select class="form-control" data-name="sourceField">
                        <option value=""></option>
                        ${this.getSourceFieldOptionsHtml()}
                    </select>
                </div>
            `;
        }

        getExpressionSectionHtml() {
            return `
                <div class="form-group">
                    <label class="control-label">${this.escapeHtml(this.translate('Expression', 'fields', 'WorkflowDefinition'))}</label>
                    <div class="workflow-expression-editor"></div>
                </div>
            `;
        }

        renderExpressionField() {
            const selector = '.workflow-expression-editor';

            this.expressionModel.set('expression', this.state.expression || '', {silent: true});

            this.createView('expressionField', 'views/fields/formula', {
                selector: selector,
                model: this.expressionModel,
                name: 'expression',
                mode: 'edit',
                targetEntityType: this.sourceEntityType,
                height: 240,
                smallFont: true,
                insertDisabled: false,
                checkSyntaxDisabled: false,
            }, view => {
                if (this.isRendered()) {
                    view.render();
                }
            });
        }

        getConstantInputHtml() {
            const type = this.getConstantInputType();
            const value = this.state.value;

            if (type === 'bool') {
                const checked = value ? ' checked' : '';

                return `<div class="checkbox"><label><input type="checkbox" data-name="constantValueBool"${checked}> ${this.escapeHtml(this.translate('Yes'))}</label></div>`;
            }

            if (type === 'enum') {
                return `
                    <select class="form-control" data-name="constantValueEnum">
                        <option value=""></option>
                        ${this.getEnumOptionsHtml(Array.isArray(value) ? '' : value)}
                    </select>
                `;
            }

            if (type === 'multiEnum') {
                const selectedValues = Array.isArray(value) ? value : [];

                return `
                    <select class="form-control" data-name="constantValueMultiEnum" multiple size="8">
                        ${this.getEnumOptionsHtml(selectedValues)}
                    </select>
                `;
            }

            if (type === 'text') {
                return `<textarea class="form-control" data-name="constantValueText" rows="6">${this.escapeHtml(this.getScalarValue(value))}</textarea>`;
            }

            if (type === 'date') {
                return `<input class="form-control" type="date" data-name="constantValueDate" value="${this.escapeHtml(this.getScalarValue(value))}">`;
            }

            if (type === 'datetime') {
                return `<input class="form-control" type="datetime-local" data-name="constantValueDatetime" value="${this.escapeHtml(this.getScalarValue(value))}">`;
            }

            if (type === 'number') {
                return `<input class="form-control" type="number" step="any" data-name="constantValueNumber" value="${this.escapeHtml(this.getScalarValue(value))}">`;
            }

            if (type === 'link') {
                const idValue = value && typeof value === 'object' ? (value.id || '') : '';
                const nameValue = value && typeof value === 'object' ? (value.name || '') : '';

                return `
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label class="control-label">${this.escapeHtml(this.translate('ID'))}</label>
                        <input class="form-control" type="text" data-name="constantValueId" value="${this.escapeHtml(idValue)}">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label class="control-label">${this.escapeHtml(this.translate('Name'))}</label>
                        <input class="form-control" type="text" data-name="constantValueName" value="${this.escapeHtml(nameValue)}">
                    </div>
                `;
            }

            return `<input class="form-control" type="text" data-name="constantValueText" value="${this.escapeHtml(this.getScalarValue(value))}">`;
        }

        getEnumOptionsHtml(selectedValueOrArray) {
            const selectedList = Array.isArray(selectedValueOrArray) ? selectedValueOrArray : [selectedValueOrArray];

            return this.valueOptions.map(option => {
                const selected = selectedList.includes(option) ? ' selected' : '';
                const label = this.translatedValueOptions[option] || option;

                return `<option value="${this.escapeHtml(option)}"${selected}>${this.escapeHtml(label)}</option>`;
            }).join('');
        }

        getSourceFieldOptionsHtml() {
            return this.fieldCatalog.getSourceFieldOptionList(this.sourceEntityType).map(name => {
                const selected = name === (this.state.sourceField || '') ? ' selected' : '';
                const label = this.fieldCatalog.translateSourceField(this.sourceEntityType, name);

                return `<option value="${this.escapeHtml(name)}"${selected}>${this.escapeHtml(label)}</option>`;
            }).join('');
        }

        captureCurrentDomValues() {
            const sourceTypeInput = this.$el.find('[data-name="sourceType"]');

            if (sourceTypeInput.length) {
                this.state.sourceType = sourceTypeInput.val() || 'constant';
            }

            if (this.state.sourceType === 'field') {
                this.state.sourceField = this.$el.find('[data-name="sourceField"]').val() || '';
                return;
            }

            if (this.state.sourceType === 'expression') {
                if (this.hasView('expressionField')) {
                    const expressionField = this.getView('expressionField');

                    expressionField.fetchToModel();
                    this.state.expression = this.expressionModel.get('expression') || '';
                }

                return;
            }

            const type = this.getConstantInputType();

            if (type === 'bool') {
                this.state.value = !!this.$el.find('[data-name="constantValueBool"]').prop('checked');
                return;
            }

            if (type === 'enum') {
                this.state.value = this.$el.find('[data-name="constantValueEnum"]').val() || '';
                return;
            }

            if (type === 'multiEnum') {
                this.state.value = this.$el.find('[data-name="constantValueMultiEnum"]').val() || [];
                return;
            }

            if (type === 'date') {
                this.state.value = this.$el.find('[data-name="constantValueDate"]').val() || '';
                return;
            }

            if (type === 'datetime') {
                this.state.value = this.$el.find('[data-name="constantValueDatetime"]').val() || '';
                return;
            }

            if (type === 'number') {
                this.state.value = this.$el.find('[data-name="constantValueNumber"]').val() || '';
                return;
            }

            if (type === 'link') {
                const id = this.$el.find('[data-name="constantValueId"]').val() || '';
                const name = this.$el.find('[data-name="constantValueName"]').val() || '';
                this.state.value = (id || name) ? {id, name} : '';
                return;
            }

            this.state.value = this.$el.find('[data-name="constantValueText"]').val() || '';
        }

        getResultValue() {
            if (this.state.sourceType !== 'constant') {
                return '';
            }

            return this.state.value ?? '';
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

        getConstantInputType() {
            const type = (this.constantFieldDefs && this.constantFieldDefs.type) || this.valueType || 'varchar';

            if (['enum'].includes(type)) {
                return 'enum';
            }

            if (['multiEnum', 'checklist'].includes(type)) {
                return 'multiEnum';
            }

            if (type === 'bool') {
                return 'bool';
            }

            if (type === 'date') {
                return 'date';
            }

            if (['datetime', 'datetimeOptional'].includes(type)) {
                return 'datetime';
            }

            if (['int', 'enumInt', 'float', 'currency', 'number', 'enumFloat'].includes(type)) {
                return 'number';
            }

            if (type === 'link') {
                return 'link';
            }

            if (['text', 'wysiwyg'].includes(type)) {
                return 'text';
            }

            return 'textLine';
        }

        getScalarValue(value) {
            if (value === null || value === undefined) {
                return '';
            }

            if (typeof value === 'object') {
                return value.name || value.id || '';
            }

            return String(value);
        }

        escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    };
});

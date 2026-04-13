define('custom:views/workflows/modals/edit-field-map-item-v3', [
    'views/modal',
    'model',
    'custom:workflows/field-catalog'
], function (ModalView, Model, FieldCatalog) {

    return class extends ModalView {

        className = 'dialog dialog-record';
        templateContent = '<div class="record no-side-margin">{{{record}}}</div>';

        setup() {
            super.setup();

            this.entityType = this.options.entityType;
            this.sourceEntityType = this.options.sourceEntityType || '';
            this.item = this.options.item || {};
            this.fieldCatalog = new FieldCatalog(this);

            this.headerText = this.translate('Field Value', 'labels', 'WorkflowDefinition');
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

            const model = this.model = new Model();
            model.name = 'WorkflowFieldMapping';
            model.set({
                field: this.item.field || '',
                valueConfig: this.normalizeValueConfig(this.item),
            });

            this.rebuildRecordView();
        }

        actionApply() {
            const recordView = this.getView('record');

            if (recordView.validate()) {
                return;
            }

            recordView.processFetch();

            const field = this.model.get('field') || '';
            const valueConfig = this.normalizeValueConfig(this.model.get('valueConfig'));

            this.trigger('apply', {
                field: field,
                sourceType: valueConfig.sourceType,
                value: valueConfig.value,
                sourceField: valueConfig.sourceField,
                expression: valueConfig.expression,
            });

            this.close();
        }

        rebuildRecordView() {
            this.model.setDefs(this.buildModelDefs());

            this.createView('record', 'views/record/edit-for-modal', {
                model: this.model,
                detailLayout: this.buildDetailLayout()
            }, view => {
                if (this.isRendered()) {
                    view.render();
                }
            });
        }

        buildModelDefs() {
            return {
                fields: {
                    field: {
                        type: 'enum',
                        required: true,
                        options: this.getFieldOptionList(),
                        translatedOptions: this.getTranslatedFieldOptions()
                    },
                    valueConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    }
                }
            };
        }

        buildDetailLayout() {
            return [
                {
                    rows: [
                        [
                            {
                                name: 'field',
                                labelText: this.translate('Field', 'fields', 'WorkflowDefinition')
                            }
                        ],
                        [
                            {
                                name: 'valueConfig',
                                labelText: this.translate('Value', 'fields', 'WorkflowDefinition'),
                                options: {
                                    sourceEntityType: this.sourceEntityType,
                                    targetEntityType: this.entityType,
                                    targetFieldAttribute: 'field',
                                    headerText: this.translate('Value', 'fields', 'WorkflowDefinition')
                                }
                            }
                        ]
                    ]
                }
            ];
        }

        getFieldOptionList() {
            return this.fieldCatalog.getTargetFieldOptionList(this.entityType);
        }

        getTranslatedFieldOptions() {
            return this.fieldCatalog.getTranslatedTargetFieldOptions(this.entityType);
        }

        normalizeValueConfig(valueConfig) {
            if (valueConfig && typeof valueConfig === 'object' && !Array.isArray(valueConfig)) {
                return {
                    sourceType: valueConfig.sourceType || (valueConfig.sourceField ? 'field' : valueConfig.expression ? 'expression' : 'constant'),
                    value: valueConfig.value ?? valueConfig.constantValue ?? '',
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
    };
});

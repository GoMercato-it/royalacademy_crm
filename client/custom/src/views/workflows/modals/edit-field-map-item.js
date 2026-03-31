define('custom:views/workflows/modals/edit-field-map-item', [
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
                sourceType: this.getSourceType(),
                constantValue: this.item.value ?? '',
                sourceField: this.item.sourceField || '',
                expression: this.item.expression || '',
            });

            this.listenTo(model, 'change:sourceType', () => this.rebuildRecordView());
            this.listenTo(model, 'change:field', () => this.rebuildRecordView());

            this.rebuildRecordView();
        }

        actionApply() {
            const recordView = this.getView('record');

            if (recordView.validate()) {
                return;
            }

            if (this.model.get('sourceType') === 'field' && !this.model.get('sourceField')) {
                Espo.Ui.warning(this.translate('selectSourceFieldFirst', 'messages', 'WorkflowDefinition'));

                return;
            }

            recordView.processFetch();

            this.trigger('apply', {
                field: this.model.get('field') || '',
                sourceType: this.model.get('sourceType') || 'constant',
                value: this.model.has('constantValue') ? this.model.get('constantValue') : '',
                sourceField: this.model.get('sourceField') || '',
                expression: this.model.get('expression') || '',
            });

            this.close();
        }

        getSourceType() {
            if (this.item.sourceType) {
                return this.item.sourceType;
            }

            if (this.item.expression) {
                return 'expression';
            }

            if (this.item.sourceField) {
                return 'field';
            }

            return 'constant';
        }

        rebuildRecordView() {
            this.model.setDefs(this.buildModelDefs());

            if (this.hasView('record')) {
                this.clearView('record');
            }

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
                    sourceType: {
                        type: 'enum',
                        required: true,
                        options: ['constant', 'field', 'expression'],
                        translatedOptions: {
                            constant: this.translate('Raw Text', 'labels', 'WorkflowDefinition'),
                            field: this.translate('Source Field', 'fields', 'WorkflowDefinition'),
                            expression: this.translate('Expression', 'fields', 'WorkflowDefinition'),
                        }
                    },
                    constantValue: this.getConstantValueFieldDefs(),
                    sourceField: {
                        type: 'enum',
                        options: this.getSourceFieldOptionList(),
                        translatedOptions: this.getTranslatedSourceFieldOptions()
                    },
                    expression: {
                        type: 'formula',
                        view: 'views/fields/formula'
                    }
                }
            };
        }

        buildDetailLayout() {
            const rows = [
                [
                    {
                        name: 'field',
                        labelText: this.translate('Field', 'fields', 'WorkflowDefinition')
                    }
                ],
                [
                    {
                        name: 'sourceType',
                        labelText: this.translate('Value Source', 'fields', 'WorkflowDefinition')
                    }
                ]
            ];

            const sourceType = this.model.get('sourceType') || 'constant';

            if (sourceType === 'field') {
                rows.push([
                    {
                        name: 'sourceField',
                        labelText: this.translate('Source Field', 'fields', 'WorkflowDefinition')
                    }
                ]);
            }
            else if (sourceType === 'expression') {
                rows.push([
                    {
                        name: 'expression',
                        labelText: this.translate('Expression', 'fields', 'WorkflowDefinition'),
                        options: {
                            targetEntityType: this.sourceEntityType,
                            height: 180,
                            smallFont: true,
                        }
                    }
                ]);
            }
            else {
                rows.push([
                    {
                        name: 'constantValue',
                        labelText: this.translate('Value', 'fields', 'WorkflowDefinition')
                    }
                ]);
            }

            return [
                {
                    rows: rows
                }
            ];
        }

        getFieldOptionList() {
            return this.fieldCatalog.getTargetFieldOptionList(this.entityType);
        }

        getTranslatedFieldOptions() {
            return this.fieldCatalog.getTranslatedTargetFieldOptions(this.entityType);
        }

        getSourceFieldOptionList() {
            return this.fieldCatalog.getSourceFieldOptionList(this.sourceEntityType);
        }

        getTranslatedSourceFieldOptions() {
            return this.fieldCatalog.getTranslatedSourceFieldOptions(this.sourceEntityType);
        }

        translateSourceField(name) {
            return this.fieldCatalog.translateSourceField(this.sourceEntityType, name);
        }

        getConstantValueFieldDefs() {
            const field = this.model.get('field') || '';
            return this.fieldCatalog.getTargetValueFieldDefs(this.entityType, field);
        }
    };
});

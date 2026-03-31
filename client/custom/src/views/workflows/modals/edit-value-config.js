define('custom:views/workflows/modals/edit-value-config', [
    'views/modal',
    'model',
    'custom:workflows/field-catalog'
], function (ModalView, Model, FieldCatalog) {

    return class extends ModalView {

        className = 'dialog dialog-record';
        templateContent = '<div class="record no-side-margin">{{{record}}}</div>';

        setup() {
            super.setup();

            this.sourceEntityType = this.options.sourceEntityType || '';
            this.valueType = this.options.valueType || 'varchar';
            this.valueOptions = this.options.valueOptions || [];
            this.translatedValueOptions = this.options.translatedValueOptions || {};
            this.headerText = this.options.headerText || this.translate('Value', 'fields', 'WorkflowDefinition');
            this.valueConfig = this.normalizeValueConfig(this.options.valueConfig);
            this.fieldCatalog = new FieldCatalog(this);

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
            model.name = 'WorkflowValueConfig';
            model.set({
                sourceType: this.valueConfig.sourceType,
                constantValue: this.valueConfig.value,
                sourceField: this.valueConfig.sourceField,
                expression: this.valueConfig.expression,
            });

            this.listenTo(model, 'change:sourceType', () => this.rebuildRecordView());
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
                sourceType: this.model.get('sourceType') || 'constant',
                value: this.model.has('constantValue') ? this.model.get('constantValue') : '',
                sourceField: this.model.get('sourceField') || '',
                expression: this.model.get('expression') || '',
            });

            this.close();
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

        rebuildRecordView() {
            this.model.setDefs({
                fields: {
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
                    constantValue: this.getConstantFieldDefs(),
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
            });

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

        buildDetailLayout() {
            const rows = [
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

        getConstantFieldDefs() {
            if (this.valueType === 'enum') {
                return {
                    type: 'enum',
                    options: this.valueOptions,
                    translatedOptions: this.translatedValueOptions
                };
            }

            if (this.valueType === 'multiEnum' || this.valueType === 'checklist') {
                return {
                    type: this.valueType,
                    options: this.valueOptions,
                    translatedOptions: this.translatedValueOptions
                };
            }

            if (this.valueType === 'bool') {
                return {
                    type: 'bool'
                };
            }

            if (this.valueType === 'date') {
                return {
                    type: 'date'
                };
            }

            if (this.valueType === 'datetime' || this.valueType === 'datetimeOptional') {
                return {
                    type: this.valueType
                };
            }

            if (this.valueType === 'int' || this.valueType === 'enumInt') {
                return {
                    type: 'int'
                };
            }

            if (this.valueType === 'float' || this.valueType === 'currency' || this.valueType === 'number' || this.valueType === 'enumFloat') {
                return {
                    type: 'float'
                };
            }

            if (this.valueType === 'text' || this.valueType === 'wysiwyg') {
                return {
                    type: 'text'
                };
            }

            if (this.valueType === 'email') {
                return {
                    type: 'email'
                };
            }

            return {
                type: 'varchar'
            };
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
    };
});

define('custom:views/workflows/modals/edit-field-map-item', [
    'views/modal',
    'model',
    'views/record/edit-for-modal'
], function (ModalView, Model, EditForModalView) {

    return class extends ModalView {

        className = 'dialog dialog-record';
        templateContent = '<div class="record no-side-margin">{{{record}}}</div>';

        setup() {
            super.setup();

            this.entityType = this.options.entityType;
            this.sourceEntityType = this.options.sourceEntityType || '';
            this.item = this.options.item || {};

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
                value: this.item.value || '',
                sourceField: this.item.sourceField || '',
                expression: this.item.expression || '',
            });
            model.setDefs({
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
                    value: {
                        type: 'text'
                    },
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

            this.createView('record', 'views/record/edit-for-modal', {
                model: model,
                detailLayout: [
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
                                    name: 'sourceType',
                                    labelText: this.translate('Value Source', 'fields', 'WorkflowDefinition')
                                }
                            ],
                            [
                                {
                                    name: 'value',
                                    labelText: this.translate('Value', 'fields', 'WorkflowDefinition')
                                }
                            ],
                            [
                                {
                                    name: 'sourceField',
                                    labelText: this.translate('Source Field', 'fields', 'WorkflowDefinition')
                                }
                            ],
                            [
                                {
                                    name: 'expression',
                                    labelText: this.translate('Expression', 'fields', 'WorkflowDefinition'),
                                    options: {
                                        targetEntityType: this.sourceEntityType,
                                        height: 180,
                                        smallFont: true,
                                    }
                                }
                            ]
                        ]
                    }
                ]
            });

            this.listenTo(model, 'change:sourceType', () => this.controlSourceTypeFields());
        }

        afterRender() {
            super.afterRender();

            this.controlSourceTypeFields();
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
                value: this.model.get('value') || '',
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

        getFieldOptionList() {
            const fields = this.getMetadata().get(['entityDefs', this.entityType, 'fields']) || {};

            return Object.keys(fields).filter(name => {
                const defs = fields[name] || {};
                const type = defs.type || '';

                if (defs.readOnly || defs.notStorable) {
                    return false;
                }

                if ([
                    'link',
                    'linkParent',
                    'linkMultiple',
                    'file',
                    'image',
                    'jsonObject',
                    'jsonArray',
                    'base',
                    'foreign',
                    'foreignId',
                    'foreignArray',
                    'map'
                ].includes(type)) {
                    return false;
                }

                return true;
            }).sort((a, b) => {
                const aLabel = this.translate(a, 'fields', this.entityType) || a;
                const bLabel = this.translate(b, 'fields', this.entityType) || b;

                return aLabel.localeCompare(bLabel);
            });
        }

        getTranslatedFieldOptions() {
            const translated = {};

            this.getFieldOptionList().forEach(name => {
                translated[name] = this.translate(name, 'fields', this.entityType) || name;
            });

            return translated;
        }

        getSourceFieldOptionList() {
            if (!this.sourceEntityType) {
                return [];
            }

            const attributeList = this.getFieldManager().getEntityTypeAttributeList(this.sourceEntityType)
                .concat(['id'])
                .sort();
            const links = this.getMetadata().get(['entityDefs', this.sourceEntityType, 'links']) || {};
            const linkList = [];

            Object.keys(links).forEach(link => {
                const type = links[link].type;

                if (!type) {
                    return;
                }

                if (['belongsToParent', 'hasOne', 'belongsTo'].includes(type)) {
                    linkList.push(link);
                }
            });

            linkList.sort();

            linkList.forEach(link => {
                const scope = links[link].entity;

                if (!scope || links[link].disabled) {
                    return;
                }

                this.getFieldManager().getEntityTypeAttributeList(scope)
                    .sort()
                    .forEach(item => attributeList.push(`${link}.${item}`));

                attributeList.push(`${link}.id`);
            });

            return [...new Set(attributeList)];
        }

        getTranslatedSourceFieldOptions() {
            const translated = {};

            this.getSourceFieldOptionList().forEach(name => {
                translated[name] = this.translateSourceField(name);
            });

            return translated;
        }

        translateSourceField(name) {
            if (!name.includes('.')) {
                return this.translate(name, 'fields', this.sourceEntityType) || name;
            }

            const [link, attribute] = name.split('.', 2);
            const linkDefs = this.getMetadata().get(['entityDefs', this.sourceEntityType, 'links', link]) || {};
            const relatedEntityType = linkDefs.entity || '';
            const linkLabel = this.translate(link, 'links', this.sourceEntityType) ||
                this.translate(link, 'fields', this.sourceEntityType) ||
                link;
            const attributeLabel = this.translate(attribute, 'fields', relatedEntityType) || attribute;

            return `${linkLabel} > ${attributeLabel}`;
        }

        controlSourceTypeFields() {
            const recordView = this.getView('record');

            if (!recordView) {
                return;
            }

            recordView.hideField('value');
            recordView.hideField('sourceField');
            recordView.hideField('expression');

            const sourceType = this.model.get('sourceType') || 'constant';

            if (sourceType === 'field') {
                recordView.showField('sourceField');

                return;
            }

            if (sourceType === 'expression') {
                recordView.showField('expression');

                return;
            }

            recordView.showField('value');
        }
    };
});

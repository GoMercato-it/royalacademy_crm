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
                value: this.item.value || '',
            });
            model.setDefs({
                fields: {
                    field: {
                        type: 'enum',
                        required: true,
                        options: this.getFieldOptionList(),
                        translatedOptions: this.getTranslatedFieldOptions()
                    },
                    value: {
                        type: 'text'
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
                                    name: 'value',
                                    labelText: this.translate('Value', 'fields', 'WorkflowDefinition')
                                }
                            ]
                        ]
                    }
                ]
            });
        }

        actionApply() {
            const recordView = this.getView('record');

            if (recordView.validate()) {
                return;
            }

            recordView.processFetch();

            this.trigger('apply', {
                field: this.model.get('field') || '',
                value: this.model.get('value') || '',
            });

            this.close();
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
    };
});

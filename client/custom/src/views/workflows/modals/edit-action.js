define('custom:views/workflows/modals/edit-action', [
    'views/modal',
    'model',
    'views/record/edit-for-modal'
], function (ModalView, Model, EditForModalView) {

    return class extends ModalView {

        className = 'dialog dialog-record';
        templateContent = '<div class="record no-side-margin">{{{record}}}</div>';

        setup() {
            super.setup();

            this.actionConfig = Espo.Utils.cloneDeep(this.options.actionConfig || {});
            this.actionKey = `${this.actionConfig.provider}.${this.actionConfig.action}`;
            this.workflowEntityType = this.options.workflowEntityType || '';

            this.headerText = this.options.translatedLabel || this.actionKey;
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
            model.name = 'WorkflowActionConfig';
            model.set(this.getInitialAttributes());
            model.setDefs(this.getModelDefs());

            this.createView('record', 'views/record/edit-for-modal', {
                model: model,
                detailLayout: this.getDetailLayout()
            });
        }

        actionApply() {
            const recordView = this.getView('record');

            if (recordView.validate()) {
                return;
            }

            recordView.processFetch();

            this.trigger('apply', {
                provider: this.actionConfig.provider,
                action: this.actionConfig.action,
                payload: this.buildPayload(),
            });

            this.close();
        }

        getInitialAttributes() {
            const payload = this.actionConfig.payload || {};

            switch (this.actionKey) {
                case 'record.create_record':
                    return {
                        targetEntityType: payload.entityType || '',
                        fieldAssignments: this.normalizeFieldAssignments(payload.attributes || []),
                    };

                case 'record.update_record':
                    return {
                        targetEntityType: payload.entityType || '',
                        recordIdConfig: this.normalizeValueConfig(payload.id || payload.recordId || ''),
                        fieldAssignments: this.normalizeFieldAssignments(payload.attributes || []),
                    };

                case 'record.assign_owner':
                    return {
                        targetEntityType: payload.entityType || '',
                        recordIdConfig: this.normalizeValueConfig(payload.id || payload.recordId || ''),
                        assignedUserConfig: this.normalizeValueConfig(payload.assignedUserId || payload.ownerUserId || ''),
                    };

                case 'whatsapp.send_message':
                    return {
                        waIdConfig: this.normalizeValueConfig(payload.waId || payload.chatId || payload.phone || ''),
                        messageBodyConfig: this.normalizeValueConfig(payload.body || payload.message || payload.text || ''),
                    };

                case 'email.send_email':
                    return {
                        toEmailConfig: this.normalizeValueConfig(payload.to || ''),
                        emailSubjectConfig: this.normalizeValueConfig(payload.subject || ''),
                        emailBodyConfig: this.normalizeValueConfig(payload.body || ''),
                    };

                default:
                    return {};
            }
        }

        getModelDefs() {
            return {
                fields: {
                    targetEntityType: {
                        type: 'varchar',
                        view: 'views/fields/entity-type'
                    },
                    recordIdConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    assignedUserConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    fieldAssignments: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/action-field-map'
                    },
                    waIdConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    messageBodyConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    toEmailConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    emailSubjectConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    emailBodyConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    }
                }
            };
        }

        getDetailLayout() {
            switch (this.actionKey) {
                case 'record.create_record':
                    return [
                        {
                            rows: [
                                [
                                    {
                                        name: 'targetEntityType',
                                        labelText: this.translate('Target Entity', 'fields', 'WorkflowDefinition')
                                    }
                                ],
                                [
                                    {
                                        name: 'fieldAssignments',
                                        labelText: this.translate('Fields', 'fields', 'WorkflowDefinition'),
                                        options: {
                                            sourceEntityType: this.workflowEntityType
                                        }
                                    }
                                ]
                            ]
                        }
                    ];

                case 'record.update_record':
                    return [
                        {
                            rows: [
                                [
                                    {
                                        name: 'targetEntityType',
                                        labelText: this.translate('Target Entity', 'fields', 'WorkflowDefinition')
                                    },
                                    {
                                        name: 'recordIdConfig',
                                        labelText: this.translate('Record ID', 'fields', 'WorkflowDefinition'),
                                        options: {
                                            sourceEntityType: this.workflowEntityType,
                                            valueType: 'varchar',
                                            headerText: this.translate('Record ID', 'fields', 'WorkflowDefinition')
                                        }
                                    }
                                ],
                                [
                                    {
                                        name: 'fieldAssignments',
                                        labelText: this.translate('Fields', 'fields', 'WorkflowDefinition'),
                                        options: {
                                            sourceEntityType: this.workflowEntityType
                                        }
                                    }
                                ]
                            ]
                        }
                    ];

                case 'record.assign_owner':
                    return [
                        {
                            rows: [
                                [
                                    {
                                        name: 'targetEntityType',
                                        labelText: this.translate('Target Entity', 'fields', 'WorkflowDefinition')
                                    },
                                    {
                                        name: 'recordIdConfig',
                                        labelText: this.translate('Record ID', 'fields', 'WorkflowDefinition'),
                                        options: {
                                            sourceEntityType: this.workflowEntityType,
                                            valueType: 'varchar',
                                            headerText: this.translate('Record ID', 'fields', 'WorkflowDefinition')
                                        }
                                    }
                                ],
                                [
                                    {
                                        name: 'assignedUserConfig',
                                        labelText: this.translate('Assigned User', 'fields', 'WorkflowDefinition'),
                                        options: {
                                            sourceEntityType: this.workflowEntityType,
                                            valueType: 'varchar',
                                            headerText: this.translate('Assigned User', 'fields', 'WorkflowDefinition')
                                        }
                                    }
                                ]
                            ]
                        }
                    ];

                case 'whatsapp.send_message':
                    return [
                        {
                            rows: [
                                [
                                    {
                                        name: 'waIdConfig',
                                        labelText: this.translate('WhatsApp ID', 'fields', 'WorkflowDefinition'),
                                        options: {
                                            sourceEntityType: this.workflowEntityType,
                                            valueType: 'varchar',
                                            headerText: this.translate('WhatsApp ID', 'fields', 'WorkflowDefinition')
                                        }
                                    }
                                ],
                                [
                                    {
                                        name: 'messageBodyConfig',
                                        labelText: this.translate('Message Body', 'fields', 'WorkflowDefinition'),
                                        options: {
                                            sourceEntityType: this.workflowEntityType,
                                            valueType: 'text',
                                            headerText: this.translate('Message Body', 'fields', 'WorkflowDefinition')
                                        }
                                    }
                                ]
                            ]
                        }
                    ];

                case 'email.send_email':
                    return [
                        {
                            rows: [
                                [
                                    {
                                        name: 'toEmailConfig',
                                        labelText: this.translate('To Email', 'fields', 'WorkflowDefinition'),
                                        options: {
                                            sourceEntityType: this.workflowEntityType,
                                            valueType: 'email',
                                            headerText: this.translate('To Email', 'fields', 'WorkflowDefinition')
                                        }
                                    }
                                ],
                                [
                                    {
                                        name: 'emailSubjectConfig',
                                        labelText: this.translate('Subject', 'fields', 'WorkflowDefinition'),
                                        options: {
                                            sourceEntityType: this.workflowEntityType,
                                            valueType: 'varchar',
                                            headerText: this.translate('Subject', 'fields', 'WorkflowDefinition')
                                        }
                                    }
                                ],
                                [
                                    {
                                        name: 'emailBodyConfig',
                                        labelText: this.translate('Email Body', 'fields', 'WorkflowDefinition'),
                                        options: {
                                            sourceEntityType: this.workflowEntityType,
                                            valueType: 'text',
                                            headerText: this.translate('Email Body', 'fields', 'WorkflowDefinition')
                                        }
                                    }
                                ]
                            ]
                        }
                    ];

                default:
                    return [
                        {
                            rows: []
                        }
                    ];
            }
        }

        buildPayload() {
            switch (this.actionKey) {
                case 'record.create_record':
                    return {
                        entityType: this.model.get('targetEntityType') || '',
                        attributes: this.model.get('fieldAssignments') || [],
                    };

                case 'record.update_record':
                    return {
                        entityType: this.model.get('targetEntityType') || '',
                        id: this.model.get('recordIdConfig') || '',
                        attributes: this.model.get('fieldAssignments') || [],
                    };

                case 'record.assign_owner':
                    return {
                        entityType: this.model.get('targetEntityType') || '',
                        id: this.model.get('recordIdConfig') || '',
                        assignedUserId: this.model.get('assignedUserConfig') || '',
                    };

                case 'whatsapp.send_message':
                    return {
                        waId: this.model.get('waIdConfig') || '',
                        body: this.model.get('messageBodyConfig') || '',
                    };

                case 'email.send_email':
                    return {
                        to: this.model.get('toEmailConfig') || '',
                        subject: this.model.get('emailSubjectConfig') || '',
                        body: this.model.get('emailBodyConfig') || '',
                    };

                default:
                    return this.actionConfig.payload || {};
            }
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

        normalizeFieldAssignments(assignments) {
            if (assignments && typeof assignments === 'object' && !Array.isArray(assignments)) {
                return Object.keys(assignments).map(field => ({
                    field: field,
                    sourceType: 'constant',
                    value: assignments[field] ?? '',
                    sourceField: '',
                    expression: '',
                }));
            }

            if (!Array.isArray(assignments)) {
                return [];
            }

            return assignments
                .map(item => {
                    if (!item || typeof item !== 'object' || Array.isArray(item)) {
                        return null;
                    }

                    return {
                        field: item.field || '',
                        sourceType: item.sourceType || (item.sourceField ? 'field' : item.expression ? 'expression' : 'constant'),
                        value: item.value ?? item.constantValue ?? '',
                        sourceField: item.sourceField || '',
                        expression: item.expression || '',
                    };
                })
                .filter(item => item && item.field);
        }
    };
});

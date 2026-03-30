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
                        fieldAssignments: payload.attributes || [],
                    };

                case 'record.update_record':
                    return {
                        targetEntityType: payload.entityType || '',
                        recordId: payload.id || '',
                        fieldAssignments: payload.attributes || [],
                    };

                case 'record.assign_owner':
                    return {
                        targetEntityType: payload.entityType || '',
                        recordId: payload.id || '',
                        assignedUserId: payload.assignedUserId || '',
                        assignedUserName: payload.assignedUserName || '',
                    };

                case 'whatsapp.send_message':
                    return {
                        waId: payload.waId || payload.chatId || '',
                        messageBody: payload.body || payload.message || '',
                    };

                case 'email.send_email':
                    return {
                        toEmail: payload.to || '',
                        emailSubject: payload.subject || '',
                        emailBody: payload.body || '',
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
                    recordId: {
                        type: 'varchar'
                    },
                    assignedUser: {
                        type: 'link',
                        view: 'views/fields/user'
                    },
                    fieldAssignments: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/action-field-map'
                    },
                    waId: {
                        type: 'varchar'
                    },
                    messageBody: {
                        type: 'text'
                    },
                    toEmail: {
                        type: 'varchar'
                    },
                    emailSubject: {
                        type: 'varchar'
                    },
                    emailBody: {
                        type: 'text'
                    }
                },
                links: {
                    assignedUser: {
                        type: 'belongsTo',
                        entity: 'User'
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
                                        labelText: this.translate('Fields', 'fields', 'WorkflowDefinition')
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
                                        name: 'recordId',
                                        labelText: this.translate('Record ID', 'fields', 'WorkflowDefinition')
                                    }
                                ],
                                [
                                    {
                                        name: 'fieldAssignments',
                                        labelText: this.translate('Fields', 'fields', 'WorkflowDefinition')
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
                                        name: 'recordId',
                                        labelText: this.translate('Record ID', 'fields', 'WorkflowDefinition')
                                    }
                                ],
                                [
                                    {
                                        name: 'assignedUser',
                                        labelText: this.translate('Assigned User', 'fields', 'WorkflowDefinition')
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
                                        name: 'waId',
                                        labelText: this.translate('WhatsApp ID', 'fields', 'WorkflowDefinition')
                                    }
                                ],
                                [
                                    {
                                        name: 'messageBody',
                                        labelText: this.translate('Message Body', 'fields', 'WorkflowDefinition')
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
                                        name: 'toEmail',
                                        labelText: this.translate('To Email', 'fields', 'WorkflowDefinition')
                                    }
                                ],
                                [
                                    {
                                        name: 'emailSubject',
                                        labelText: this.translate('Subject', 'fields', 'WorkflowDefinition')
                                    }
                                ],
                                [
                                    {
                                        name: 'emailBody',
                                        labelText: this.translate('Email Body', 'fields', 'WorkflowDefinition')
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
                        id: this.model.get('recordId') || '',
                        attributes: this.model.get('fieldAssignments') || [],
                    };

                case 'record.assign_owner':
                    return {
                        entityType: this.model.get('targetEntityType') || '',
                        id: this.model.get('recordId') || '',
                        assignedUserId: this.model.get('assignedUserId') || '',
                        assignedUserName: this.model.get('assignedUserName') || '',
                    };

                case 'whatsapp.send_message':
                    return {
                        waId: this.model.get('waId') || '',
                        body: this.model.get('messageBody') || '',
                    };

                case 'email.send_email':
                    return {
                        to: this.model.get('toEmail') || '',
                        subject: this.model.get('emailSubject') || '',
                        body: this.model.get('emailBody') || '',
                    };

                default:
                    return this.actionConfig.payload || {};
            }
        }
    };
});

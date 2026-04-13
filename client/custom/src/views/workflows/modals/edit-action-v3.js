define('custom:views/workflows/modals/edit-action-v3', [
    'views/modal',
    'model',
    'views/record/edit-for-modal',
    'custom:workflows/field-catalog'
], function (ModalView, Model, EditForModalView, FieldCatalog) {

    return class extends ModalView {

        className = 'dialog dialog-record';
        templateContent = '<div class="record no-side-margin">{{{record}}}</div>';

        setup() {
            super.setup();

            this.actionConfig = Espo.Utils.cloneDeep(this.options.actionConfig || {});
            this.actionKey = `${this.actionConfig.provider}.${this.actionConfig.action}`;
            this.workflowEntityType = this.options.workflowEntityType || '';
            this.fieldCatalog = new FieldCatalog(this);

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

                case 'record.create_task':
                    return {
                        targetEntityType: 'Task',
                        taskNameConfig: this.extractAssignmentValueConfig(payload, 'name'),
                        taskDescriptionConfig: this.extractAssignmentValueConfig(payload, 'description'),
                        taskStatusConfig: this.extractAssignmentValueConfig(payload, 'status'),
                        taskPriorityConfig: this.extractAssignmentValueConfig(payload, 'priority'),
                        taskDateStartConfig: this.extractAssignmentValueConfig(payload, 'dateStart'),
                        taskDateEndConfig: this.extractAssignmentValueConfig(payload, 'dateEnd'),
                        taskAssignedUserConfig: this.extractAssignmentValueConfig(payload, 'assignedUserId'),
                        taskParentTypeConfig: this.extractAssignmentValueConfig(payload, 'parentType'),
                        taskParentIdConfig: this.extractAssignmentValueConfig(payload, 'parentId'),
                    };

                case 'record.create_meeting':
                    return {
                        targetEntityType: 'Meeting',
                        meetingNameConfig: this.extractAssignmentValueConfig(payload, 'name'),
                        meetingDescriptionConfig: this.extractAssignmentValueConfig(payload, 'description'),
                        meetingStatusConfig: this.extractAssignmentValueConfig(payload, 'status'),
                        meetingAssignedUserConfig: this.extractAssignmentValueConfig(payload, 'assignedUserId'),
                        meetingParentTypeConfig: this.extractAssignmentValueConfig(payload, 'parentType'),
                        meetingParentIdConfig: this.extractAssignmentValueConfig(payload, 'parentId'),
                        meetingDateStartConfig: this.extractAssignmentValueConfig(payload, 'dateStart'),
                        meetingDateEndConfig: this.extractAssignmentValueConfig(payload, 'dateEnd'),
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
                case 'email.queue_email':
                    return {
                        toEmailConfig: this.normalizeValueConfig(payload.to || ''),
                        emailSubjectConfig: this.normalizeValueConfig(payload.subject || ''),
                        emailBodyConfig: this.normalizeValueConfig(payload.body || ''),
                    };

                case 'email.send_template':
                    return {
                        toEmailConfig: this.normalizeValueConfig(payload.to || ''),
                        emailTemplateConfig: this.normalizeValueConfig(payload.templateId || payload.emailTemplateId || ''),
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
                    taskNameConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    taskDescriptionConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    taskStatusConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    taskPriorityConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    taskDateStartConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    taskDateEndConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    taskAssignedUserConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    taskParentTypeConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    taskParentIdConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    meetingNameConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    meetingDescriptionConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    meetingStatusConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    meetingAssignedUserConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    meetingParentTypeConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    meetingParentIdConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    meetingDateStartConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
                    },
                    meetingDateEndConfig: {
                        type: 'base',
                        view: 'custom:views/workflows/fields/value-config'
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
                    },
                    emailTemplateConfig: {
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

                case 'record.create_task':
                    return [
                        {
                            rows: [
                                [
                                    {
                                        name: 'taskNameConfig',
                                        labelText: this.getTargetFieldLabel('Task', 'name'),
                                        options: this.getTargetFieldOptions('Task', 'name')
                                    },
                                    {
                                        name: 'taskStatusConfig',
                                        labelText: this.getTargetFieldLabel('Task', 'status'),
                                        options: this.getTargetFieldOptions('Task', 'status')
                                    }
                                ],
                                [
                                    {
                                        name: 'taskPriorityConfig',
                                        labelText: this.getTargetFieldLabel('Task', 'priority'),
                                        options: this.getTargetFieldOptions('Task', 'priority')
                                    },
                                    {
                                        name: 'taskDateEndConfig',
                                        labelText: this.getTargetFieldLabel('Task', 'dateEnd'),
                                        options: this.getTargetFieldOptions('Task', 'dateEnd')
                                    }
                                ],
                                [
                                    {
                                        name: 'taskDateStartConfig',
                                        labelText: this.getTargetFieldLabel('Task', 'dateStart'),
                                        options: this.getTargetFieldOptions('Task', 'dateStart')
                                    },
                                    {
                                        name: 'taskAssignedUserConfig',
                                        labelText: this.getTargetFieldLabel('Task', 'assignedUserId'),
                                        options: this.getTargetFieldOptions('Task', 'assignedUserId')
                                    }
                                ],
                                [
                                    {
                                        name: 'taskParentTypeConfig',
                                        labelText: this.getTargetFieldLabel('Task', 'parentType'),
                                        options: this.getTargetFieldOptions('Task', 'parentType')
                                    },
                                    {
                                        name: 'taskParentIdConfig',
                                        labelText: this.getTargetFieldLabel('Task', 'parentId'),
                                        options: this.getTargetFieldOptions('Task', 'parentId')
                                    }
                                ],
                                [
                                    {
                                        name: 'taskDescriptionConfig',
                                        labelText: this.getTargetFieldLabel('Task', 'description'),
                                        options: this.getTargetFieldOptions('Task', 'description')
                                    }
                                ]
                            ]
                        }
                    ];

                case 'record.create_meeting':
                    return [
                        {
                            rows: [
                                [
                                    {
                                        name: 'meetingNameConfig',
                                        labelText: this.getTargetFieldLabel('Meeting', 'name'),
                                        options: this.getTargetFieldOptions('Meeting', 'name')
                                    },
                                    {
                                        name: 'meetingStatusConfig',
                                        labelText: this.getTargetFieldLabel('Meeting', 'status'),
                                        options: this.getTargetFieldOptions('Meeting', 'status')
                                    }
                                ],
                                [
                                    {
                                        name: 'meetingDateStartConfig',
                                        labelText: this.getTargetFieldLabel('Meeting', 'dateStart'),
                                        options: this.getTargetFieldOptions('Meeting', 'dateStart')
                                    },
                                    {
                                        name: 'meetingDateEndConfig',
                                        labelText: this.getTargetFieldLabel('Meeting', 'dateEnd'),
                                        options: this.getTargetFieldOptions('Meeting', 'dateEnd')
                                    }
                                ],
                                [
                                    {
                                        name: 'meetingAssignedUserConfig',
                                        labelText: this.getTargetFieldLabel('Meeting', 'assignedUserId'),
                                        options: this.getTargetFieldOptions('Meeting', 'assignedUserId')
                                    },
                                    {
                                        name: 'meetingParentTypeConfig',
                                        labelText: this.getTargetFieldLabel('Meeting', 'parentType'),
                                        options: this.getTargetFieldOptions('Meeting', 'parentType')
                                    }
                                ],
                                [
                                    {
                                        name: 'meetingParentIdConfig',
                                        labelText: this.getTargetFieldLabel('Meeting', 'parentId'),
                                        options: this.getTargetFieldOptions('Meeting', 'parentId')
                                    },
                                    {
                                        name: 'meetingDescriptionConfig',
                                        labelText: this.getTargetFieldLabel('Meeting', 'description'),
                                        options: this.getTargetFieldOptions('Meeting', 'description')
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
                                            fieldDefs: {
                                                type: 'link',
                                                view: 'views/fields/user',
                                                entityType: 'User'
                                            },
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
                case 'email.queue_email':
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

                case 'email.send_template':
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
                                        name: 'emailTemplateConfig',
                                        labelText: this.translate('emailTemplate', 'fields', 'WorkflowDefinition'),
                                        options: {
                                            sourceEntityType: this.workflowEntityType,
                                            fieldDefs: {
                                                type: 'link',
                                                view: 'views/fields/link',
                                                entityType: 'EmailTemplate',
                                                params: {
                                                    entity: 'EmailTemplate'
                                                }
                                            },
                                            headerText: this.translate('emailTemplate', 'fields', 'WorkflowDefinition')
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

                case 'record.create_task':
                    return {
                        entityType: 'Task',
                        attributes: this.buildAssignmentList([
                            ['name', this.model.get('taskNameConfig')],
                            ['status', this.model.get('taskStatusConfig')],
                            ['priority', this.model.get('taskPriorityConfig')],
                            ['dateStart', this.model.get('taskDateStartConfig')],
                            ['dateEnd', this.model.get('taskDateEndConfig')],
                            ['assignedUserId', this.model.get('taskAssignedUserConfig')],
                            ['parentType', this.model.get('taskParentTypeConfig')],
                            ['parentId', this.model.get('taskParentIdConfig')],
                            ['description', this.model.get('taskDescriptionConfig')],
                        ]),
                    };

                case 'record.create_meeting':
                    return {
                        entityType: 'Meeting',
                        attributes: this.buildAssignmentList([
                            ['name', this.model.get('meetingNameConfig')],
                            ['status', this.model.get('meetingStatusConfig')],
                            ['dateStart', this.model.get('meetingDateStartConfig')],
                            ['dateEnd', this.model.get('meetingDateEndConfig')],
                            ['assignedUserId', this.model.get('meetingAssignedUserConfig')],
                            ['parentType', this.model.get('meetingParentTypeConfig')],
                            ['parentId', this.model.get('meetingParentIdConfig')],
                            ['description', this.model.get('meetingDescriptionConfig')],
                        ]),
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
                case 'email.queue_email':
                    return {
                        to: this.model.get('toEmailConfig') || '',
                        subject: this.model.get('emailSubjectConfig') || '',
                        body: this.model.get('emailBodyConfig') || '',
                    };

                case 'email.send_template':
                    return {
                        to: this.model.get('toEmailConfig') || '',
                        templateId: this.model.get('emailTemplateConfig') || '',
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

        extractAssignmentValueConfig(payload, field) {
            if (!payload || typeof payload !== 'object') {
                return this.normalizeValueConfig('');
            }

            if (field in payload) {
                return this.normalizeValueConfig(payload[field]);
            }

            const assignmentList = this.normalizeFieldAssignments(payload.attributes || []);
            const assignment = assignmentList.find(item => item.field === field);

            if (!assignment) {
                return this.normalizeValueConfig('');
            }

            return this.normalizeValueConfig({
                sourceType: assignment.sourceType,
                value: assignment.value,
                sourceField: assignment.sourceField,
                expression: assignment.expression,
            });
        }

        buildAssignmentList(itemList) {
            return itemList
                .map(([field, valueConfig]) => ({
                    field: field,
                    sourceType: valueConfig?.sourceType || 'constant',
                    value: valueConfig?.value ?? '',
                    sourceField: valueConfig?.sourceField || '',
                    expression: valueConfig?.expression || '',
                }))
                .filter(item => {
                    if (!item.field) {
                        return false;
                    }

                    if (item.sourceType === 'field') {
                        return !!item.sourceField;
                    }

                    if (item.sourceType === 'expression') {
                        return !!item.expression;
                    }

                    return item.value !== '' && item.value !== null && item.value !== undefined;
                });
        }

        getTargetFieldLabel(entityType, attribute) {
            return this.fieldCatalog.getTargetFieldLabel(entityType, attribute);
        }

        getTargetFieldOptions(entityType, attribute) {
            return {
                sourceEntityType: this.workflowEntityType,
                fieldDefs: this.fieldCatalog.getTargetValueFieldDefs(entityType, attribute),
                headerText: this.fieldCatalog.getTargetFieldLabel(entityType, attribute),
            };
        }
    };
});

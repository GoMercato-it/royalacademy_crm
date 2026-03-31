define('custom:views/workflows/fields/conditions', [
    'views/fields/base'
], function (BaseView) {

    return class extends BaseView {

        editTemplateContent = `
<div class="workflow-conditions">
    <div class="workflow-conditions-section">
        <div class="clearfix">
            <div class="pull-left"><strong>{{translate 'All Conditions' category='labels' scope='WorkflowDefinition'}}</strong></div>
            <div class="pull-right">
                <a role="button" tabindex="0" data-action="editAllConditions">{{translate 'Edit'}}</a>
            </div>
        </div>
        {{#if hasEntityType}}
        <div class="all-group-string-container" style="margin-top: 6px;"></div>
        {{else}}
        <div class="small text-muted" style="margin-top: 6px;">{{translate 'selectEntityTypeFirst' category='messages' scope='WorkflowDefinition'}}</div>
        {{/if}}
    </div>
    <div class="workflow-conditions-section" style="margin-top: 12px;">
        <div class="clearfix">
            <div class="pull-left"><strong>{{translate 'Any Conditions' category='labels' scope='WorkflowDefinition'}}</strong></div>
            <div class="pull-right">
                <a role="button" tabindex="0" data-action="editAnyConditions">{{translate 'Edit'}}</a>
            </div>
        </div>
        {{#if hasEntityType}}
        <div class="any-group-string-container" style="margin-top: 6px;"></div>
        {{else}}
        <div class="small text-muted" style="margin-top: 6px;">{{translate 'selectEntityTypeFirst' category='messages' scope='WorkflowDefinition'}}</div>
        {{/if}}
    </div>
</div>
`;

        detailTemplateContent = `
<div class="workflow-conditions">
    <div class="workflow-conditions-section">
        <div><strong>{{translate 'All Conditions' category='labels' scope='WorkflowDefinition'}}</strong></div>
        {{#if hasEntityType}}
        <div class="all-group-string-container" style="margin-top: 6px;"></div>
        {{/if}}
    </div>
    <div class="workflow-conditions-section" style="margin-top: 12px;">
        <div><strong>{{translate 'Any Conditions' category='labels' scope='WorkflowDefinition'}}</strong></div>
        {{#if hasEntityType}}
        <div class="any-group-string-container" style="margin-top: 6px;"></div>
        {{/if}}
    </div>
</div>
`;

        setup() {
            super.setup();

            this.addActionHandler('editAllConditions', () => this.editConditions('all'));
            this.addActionHandler('editAnyConditions', () => this.editConditions('any'));

            this.scope = this.getWorkflowScope();
            this.loadConditionGroups();

            this.listenTo(this.model, 'change:entityType', async () => {
                const nextScope = this.getWorkflowScope();

                if (nextScope === this.scope) {
                    return;
                }

                this.scope = nextScope;
                this.allConditionGroup = [];
                this.anyConditionGroup = [];
                this.model.set(this.name, null);

                if (this.isRendered()) {
                    await this.reRender();
                }
            });
        }

        data() {
            return {
                ...super.data(),
                hasEntityType: !!this.scope,
            };
        }

        afterRender() {
            super.afterRender();

            if (!this.scope) {
                return;
            }

            this.renderConditionStringViews();
        }

        fetch() {
            const data = {};
            const conditionGroup = this.buildConditionGroup();

            data[this.name] = conditionGroup.length ? {
                allConditionGroup: Espo.Utils.cloneDeep(this.allConditionGroup),
                anyConditionGroup: Espo.Utils.cloneDeep(this.anyConditionGroup),
                conditionGroup: conditionGroup,
            } : null;

            return data;
        }

        async editConditions(kind) {
            if (!this.scope) {
                Espo.Ui.warning(this.translate('selectEntityTypeFirst', 'messages', 'WorkflowDefinition'));

                return;
            }

            const conditionGroup = kind === 'any' ? this.anyConditionGroup : this.allConditionGroup;

            await this.createView('modal', 'views/admin/dynamic-logic/modals/edit', {
                conditionGroup: Espo.Utils.cloneDeep(conditionGroup),
                scope: this.scope
            }, view => {
                view.render();

                this.listenToOnce(view, 'apply', async updatedConditionGroup => {
                    if (kind === 'any') {
                        this.anyConditionGroup = updatedConditionGroup || [];
                    } else {
                        this.allConditionGroup = updatedConditionGroup || [];
                    }

                    this.trigger('change');

                    if (this.isRendered()) {
                        await this.reRender();
                    }
                });
            });
        }

        renderConditionStringViews() {
            this.renderConditionGroupView('allConditionGroupView', '.all-group-string-container', this.allConditionGroup, 'and');
            this.renderConditionGroupView('anyConditionGroupView', '.any-group-string-container', this.anyConditionGroup, 'or');
        }

        renderConditionGroupView(viewName, selector, conditionGroup, operator) {
            if (this.hasView(viewName)) {
                this.clearView(viewName);
            }

            this.createView(viewName, 'views/admin/dynamic-logic/conditions-string/group-base', {
                selector: selector,
                itemData: {
                    value: conditionGroup || []
                },
                operator: operator,
                scope: this.scope
            }, view => {
                if (this.isRendered()) {
                    view.render();
                }
            });
        }

        getWorkflowScope() {
            return this.model.get('entityType') || this.params.scope || this.options.scope || null;
        }

        loadConditionGroups() {
            const value = this.model.get(this.name) || {};
            const normalized = this.normalizeStoredConditions(value);

            this.allConditionGroup = normalized.allConditionGroup;
            this.anyConditionGroup = normalized.anyConditionGroup;
        }

        normalizeStoredConditions(value) {
            const allConditionGroup = Array.isArray(value.allConditionGroup) ? Espo.Utils.cloneDeep(value.allConditionGroup) : null;
            const anyConditionGroup = Array.isArray(value.anyConditionGroup) ? Espo.Utils.cloneDeep(value.anyConditionGroup) : null;

            if (allConditionGroup !== null || anyConditionGroup !== null) {
                return {
                    allConditionGroup: allConditionGroup || [],
                    anyConditionGroup: anyConditionGroup || [],
                };
            }

            const legacyConditionGroup = Array.isArray(value.conditionGroup) ? value.conditionGroup : [];

            if (legacyConditionGroup.length === 0) {
                return {
                    allConditionGroup: [],
                    anyConditionGroup: [],
                };
            }

            if (
                legacyConditionGroup.length === 2 &&
                legacyConditionGroup[0]?.type === 'and' &&
                Array.isArray(legacyConditionGroup[0]?.value) &&
                legacyConditionGroup[1]?.type === 'or' &&
                Array.isArray(legacyConditionGroup[1]?.value)
            ) {
                return {
                    allConditionGroup: Espo.Utils.cloneDeep(legacyConditionGroup[0].value),
                    anyConditionGroup: Espo.Utils.cloneDeep(legacyConditionGroup[1].value),
                };
            }

            if (
                legacyConditionGroup.length === 1 &&
                legacyConditionGroup[0]?.type === 'or' &&
                Array.isArray(legacyConditionGroup[0]?.value)
            ) {
                return {
                    allConditionGroup: [],
                    anyConditionGroup: Espo.Utils.cloneDeep(legacyConditionGroup[0].value),
                };
            }

            if (
                legacyConditionGroup.length === 1 &&
                legacyConditionGroup[0]?.type === 'and' &&
                Array.isArray(legacyConditionGroup[0]?.value)
            ) {
                return {
                    allConditionGroup: Espo.Utils.cloneDeep(legacyConditionGroup[0].value),
                    anyConditionGroup: [],
                };
            }

            return {
                allConditionGroup: Espo.Utils.cloneDeep(legacyConditionGroup),
                anyConditionGroup: [],
            };
        }

        buildConditionGroup() {
            const group = [];

            if (this.allConditionGroup.length) {
                group.push({
                    type: 'and',
                    value: Espo.Utils.cloneDeep(this.allConditionGroup),
                });
            }

            if (this.anyConditionGroup.length) {
                group.push({
                    type: 'or',
                    value: Espo.Utils.cloneDeep(this.anyConditionGroup),
                });
            }

            return group;
        }
    };
});

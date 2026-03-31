define('custom:workflows/field-catalog', [], function () {

    const COMPLEX_FIELD_TYPE_LIST = [
        'attachmentMultiple',
        'file',
        'foreign',
        'foreignArray',
        'foreignId',
        'image',
        'jsonArray',
        'jsonObject',
        'linkMultiple',
        'map',
    ];

    const PART_LABEL_MAP = {
        Id: 'ID',
        Ids: 'IDs',
        Type: 'Type',
        Name: 'Name',
        Street: 'Street',
        City: 'City',
        State: 'State',
        PostalCode: 'Postal Code',
        Country: 'Country',
        Currency: 'Currency',
        First: 'First',
        Last: 'Last',
        Middle: 'Middle',
        Salutation: 'Salutation',
    };

    return class {

        constructor(view) {
            this.view = view;
            this.attributeContextCache = {};
            this.targetDescriptorCache = {};
            this.sourceOptionCache = {};
        }

        getSourceFieldOptionList(entityType) {
            return this.getSourceFieldOptions(entityType).list;
        }

        getTranslatedSourceFieldOptions(entityType) {
            return this.getSourceFieldOptions(entityType).translatedOptions;
        }

        translateSourceField(entityType, name) {
            if (!name) {
                return '';
            }

            if (!name.includes('.')) {
                return this.translateAttribute(entityType, name, false);
            }

            const [link, attribute] = name.split('.', 2);
            const linkDefs = this.getMetadata().get(['entityDefs', entityType, 'links', link]) || {};
            const relatedEntityType = linkDefs.entity || '';
            const linkLabel = this.translate(link, 'links', entityType) ||
                this.translate(link, 'fields', entityType) ||
                link;
            const attributeLabel = this.translateAttribute(relatedEntityType, attribute, false);

            return `${linkLabel} > ${attributeLabel}`;
        }

        getTargetFieldOptionList(entityType) {
            return this.getTargetDescriptorMap(entityType).list;
        }

        getTranslatedTargetFieldOptions(entityType) {
            return this.getTargetDescriptorMap(entityType).translatedOptions;
        }

        getTargetFieldLabel(entityType, attribute) {
            return this.getTargetDescriptorMap(entityType).translatedOptions[attribute] ||
                this.translateAttribute(entityType, attribute, true);
        }

        getTargetValueFieldDefs(entityType, attribute) {
            const descriptor = this.getTargetDescriptorMap(entityType).map[attribute];

            if (!descriptor) {
                return {
                    type: 'varchar'
                };
            }

            const defs = {
                type: descriptor.valueType || 'varchar'
            };

            if (descriptor.valueOptions?.length) {
                defs.options = descriptor.valueOptions;
            }

            if (descriptor.translatedValueOptions && Object.keys(descriptor.translatedValueOptions).length) {
                defs.translatedOptions = descriptor.translatedValueOptions;
            }

            if (descriptor.view) {
                defs.view = descriptor.view;
            }

            if (descriptor.params) {
                defs.params = descriptor.params;
            }

            if (descriptor.entityType) {
                defs.entityType = descriptor.entityType;
            }

            return defs;
        }

        getTargetAttributeValueType(entityType, attribute) {
            return this.getTargetDescriptorMap(entityType).map[attribute]?.valueType || 'varchar';
        }

        formatTargetValue(entityType, attribute, value) {
            const descriptor = this.getTargetDescriptorMap(entityType).map[attribute];

            if (value === null || value === undefined || value === '') {
                return this.translate('None');
            }

            if (!descriptor) {
                return Array.isArray(value) ? value.join(', ') : value.toString();
            }

            if (descriptor.valueType === 'bool') {
                return value ? this.translate('Yes') : this.translate('No');
            }

            if ((descriptor.valueType === 'enum' || descriptor.valueType === 'multiEnum' || descriptor.valueType === 'checklist') && !Array.isArray(value)) {
                return descriptor.translatedValueOptions?.[value] || value;
            }

            if ((descriptor.valueType === 'multiEnum' || descriptor.valueType === 'checklist') && Array.isArray(value)) {
                return value.map(item => descriptor.translatedValueOptions?.[item] || item).join(', ');
            }

            return Array.isArray(value) ? value.join(', ') : value.toString();
        }

        buildAttributeContextMap(entityType, actualOnly = false) {
            const cacheKey = `${entityType}:${actualOnly ? 'actual' : 'all'}`;

            if (cacheKey in this.attributeContextCache) {
                return this.attributeContextCache[cacheKey];
            }

            const map = {};

            if (!entityType) {
                this.attributeContextCache[cacheKey] = map;

                return map;
            }

            const fieldList = this.getFieldManager().getEntityTypeFieldList(entityType, {
                onlyAvailable: true,
                acl: 'read',
            });

            fieldList.forEach(field => {
                const fieldDefs = this.getMetadata().get(['entityDefs', entityType, 'fields', field]) || {};

                if (fieldDefs.disabled || fieldDefs.utility) {
                    return;
                }

                const attributeList = actualOnly ?
                    this.getFieldManager().getEntityTypeFieldActualAttributeList(entityType, field) :
                    this.getFieldManager().getEntityTypeFieldAttributeList(entityType, field);

                (attributeList || []).forEach(attribute => {
                    if (!attribute || map[attribute]) {
                        return;
                    }

                    map[attribute] = {
                        field: field,
                        fieldDefs: fieldDefs,
                    };
                });
            });

            if (!map.id) {
                map.id = {
                    field: 'id',
                    fieldDefs: {
                        type: 'varchar'
                    },
                };
            }

            this.attributeContextCache[cacheKey] = map;

            return map;
        }

        getSourceFieldOptions(entityType) {
            if (entityType in this.sourceOptionCache) {
                return this.sourceOptionCache[entityType];
            }

            const list = [];
            const translatedOptions = {};

            if (!entityType) {
                return {
                    list,
                    translatedOptions,
                };
            }

            this.getBaseSourceAttributeList(entityType).forEach(attribute => {
                if (list.includes(attribute)) {
                    return;
                }

                list.push(attribute);
                translatedOptions[attribute] = this.translateAttribute(entityType, attribute, false);
            });

            const links = this.getMetadata().get(['entityDefs', entityType, 'links']) || {};

            Object.keys(links).sort().forEach(link => {
                const linkDefs = links[link] || {};
                const type = linkDefs.type;

                if (!type || !['belongsTo', 'belongsToParent', 'hasOne'].includes(type)) {
                    return;
                }

                const relatedEntityType = linkDefs.entity || '';

                if (!relatedEntityType || linkDefs.disabled || linkDefs.utility) {
                    return;
                }

                this.getBaseSourceAttributeList(relatedEntityType).forEach(attribute => {
                    const key = `${link}.${attribute}`;

                    if (list.includes(key)) {
                        return;
                    }

                    list.push(key);
                    translatedOptions[key] = this.translateSourceField(entityType, key);
                });
            });

            list.sort((a, b) => translatedOptions[a].localeCompare(translatedOptions[b]));

            this.sourceOptionCache[entityType] = {
                list,
                translatedOptions,
            };

            return this.sourceOptionCache[entityType];
        }

        getTargetDescriptorMap(entityType) {
            if (entityType in this.targetDescriptorCache) {
                return this.targetDescriptorCache[entityType];
            }

            const map = {};
            const list = [];
            const translatedOptions = {};

            if (!entityType) {
                return {
                    map,
                    list,
                    translatedOptions,
                };
            }

            const contextMap = this.buildAttributeContextMap(entityType, true);

            Object.keys(contextMap).forEach(attribute => {
                const descriptor = this.buildTargetDescriptor(entityType, attribute, contextMap[attribute]);

                if (!descriptor) {
                    return;
                }

                map[attribute] = descriptor;
                list.push(attribute);
                translatedOptions[attribute] = descriptor.label;
            });

            list.sort((a, b) => translatedOptions[a].localeCompare(translatedOptions[b]));

            this.targetDescriptorCache[entityType] = {
                map,
                list,
                translatedOptions,
            };

            return this.targetDescriptorCache[entityType];
        }

        buildTargetDescriptor(entityType, attribute, context) {
            const field = context.field;
            const fieldDefs = context.fieldDefs || {};

            if (attribute === 'id') {
                return {
                    valueType: 'varchar',
                    label: this.translate('ID') || 'ID',
                    valueOptions: [],
                    translatedValueOptions: {},
                };
            }

            if (fieldDefs.readOnly || fieldDefs.notStorable) {
                return null;
            }

            if (COMPLEX_FIELD_TYPE_LIST.includes(fieldDefs.type)) {
                return null;
            }

            const valueMeta = this.inferTargetValueMeta(entityType, attribute, field, fieldDefs);

            if (!valueMeta) {
                return null;
            }

            return {
                valueType: valueMeta.type,
                valueOptions: valueMeta.options || [],
                translatedValueOptions: valueMeta.translatedOptions || {},
                view: valueMeta.view || null,
                params: valueMeta.params || null,
                entityType: valueMeta.entityType || null,
                label: this.translateAttribute(entityType, attribute, true),
            };
        }

        inferTargetValueMeta(entityType, attribute, field, fieldDefs) {
            const type = fieldDefs.type || 'varchar';

            if (['email', 'phone'].includes(type) && attribute !== field) {
                return null;
            }

            if (
                attribute !== field &&
                (
                    attribute.endsWith('Data') ||
                    attribute.endsWith('Columns') ||
                    attribute.endsWith('Names') ||
                    attribute.endsWith('Ids') ||
                    attribute.endsWith('Types')
                )
            ) {
                return null;
            }

            if (attribute === field) {
                if (type === 'enum') {
                    return {
                        type: 'enum',
                        options: fieldDefs.options || [],
                        translatedOptions: this.getTranslatedOptionMap(fieldDefs.options || [], field, entityType),
                    };
                }

                if (type === 'multiEnum' || type === 'checklist') {
                    return {
                        type: type,
                        options: fieldDefs.options || [],
                        translatedOptions: this.getTranslatedOptionMap(fieldDefs.options || [], field, entityType),
                    };
                }

                if (type === 'bool') {
                    return {type: 'bool'};
                }

                if (type === 'date') {
                    return {type: 'date'};
                }

                if (type === 'datetime' || type === 'datetimeOptional') {
                    return {type: type};
                }

                if (type === 'int' || type === 'enumInt') {
                    return {type: 'int'};
                }

                if (type === 'float' || type === 'number' || type === 'enumFloat' || type === 'currency') {
                    return {type: 'float'};
                }

                if (type === 'text' || type === 'wysiwyg') {
                    return {type: 'text'};
                }

                if (type === 'email') {
                    return {type: 'email'};
                }

                return {type: 'varchar'};
            }

            if (type === 'currency' && attribute === `${field}Currency`) {
                const currencyList = this.getConfig().get('currencyList') || [];

                return {
                    type: 'enum',
                    options: currencyList,
                    translatedOptions: this.getTranslatedOptionMap(currencyList, `${field}Currency`, null),
                };
            }

            if (type === 'linkParent' && attribute === `${field}Type`) {
                const entityList = fieldDefs.entityList || [];

                return {
                    type: 'enum',
                    options: entityList,
                    translatedOptions: this.getTranslatedScopeMap(entityList),
                };
            }

            if (type === 'link' && attribute === `${field}Id`) {
                const linkDefs = this.getMetadata().get(['entityDefs', entityType, 'links', field]) || {};

                if ((linkDefs.entity || '') === 'User') {
                    return {
                        type: 'link',
                        view: 'views/fields/user',
                        entityType: 'User',
                    };
                }
            }

            if (type === 'multiEnum' || type === 'checklist') {
                return null;
            }

            if (type === 'attachmentMultiple' || type === 'linkMultiple') {
                return null;
            }

            return {type: 'varchar'};
        }

        getTranslatedOptionMap(options, field, scope) {
            const translated = {};
            const entityType = scope || '';

            options.forEach(option => {
                translated[option] = entityType ?
                    this.getLanguage().translateOption(option, field, entityType) || option :
                    option;
            });

            return translated;
        }

        getTranslatedScopeMap(scopeList) {
            const translated = {};

            scopeList.forEach(scope => {
                translated[scope] = this.translate(scope, 'scopeNames') || scope;
            });

            return translated;
        }

        getBaseSourceAttributeList(entityType) {
            const contextMap = this.buildAttributeContextMap(entityType, false);
            const list = Object.keys(contextMap);

            if (!list.includes('id')) {
                list.push('id');
            }

            if (this.getMetadata().get(`entityDefs.${entityType}.fields.name.type`) === 'personName' && !list.includes('name')) {
                list.push('name');
            }

            return list;
        }

        translateAttribute(entityType, attribute, actualOnly = false) {
            if (!attribute) {
                return '';
            }

            if (attribute === 'id') {
                return this.translate('ID') || 'ID';
            }

            const direct = entityType ? this.translate(attribute, 'fields', entityType) : '';

            if (direct && direct !== attribute) {
                return direct;
            }

            const context = this.buildAttributeContextMap(entityType, actualOnly)[attribute];

            if (!context) {
                return this.humanize(attribute);
            }

            const field = context.field;
            const fieldLabel = this.translate(field, 'fields', entityType) || field;

            if (attribute === field) {
                return fieldLabel;
            }

            const fieldDefs = context.fieldDefs || {};
            const type = fieldDefs.type || '';
            const part = this.extractAttributePart(attribute, field, type);

            if (!part) {
                return this.humanize(attribute);
            }

            const partLabel = PART_LABEL_MAP[part] || this.humanize(part);
            const naming = this.getMetadata().get(['fields', type, 'naming']) || 'suffix';

            if (naming === 'prefix') {
                return `${partLabel} ${fieldLabel}`;
            }

            return `${fieldLabel} ${partLabel}`;
        }

        extractAttributePart(attribute, field, type) {
            if (attribute.startsWith(field) && attribute !== field) {
                return attribute.slice(field.length);
            }

            const actualFields = this.getMetadata().get(['fields', type, 'actualFields']) || [];
            const naming = this.getMetadata().get(['fields', type, 'naming']) || 'suffix';
            const upperField = this.capitalize(field);

            for (const item of actualFields) {
                if (!item) {
                    continue;
                }

                if (naming === 'prefix' && attribute === `${item}${upperField}`) {
                    return this.capitalize(item);
                }

                if (naming !== 'prefix' && attribute === `${field}${this.capitalize(item)}`) {
                    return this.capitalize(item);
                }
            }

            return '';
        }

        humanize(value) {
            if (!value) {
                return '';
            }

            return value
                .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                .replace(/_/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .replace(/^./, character => character.toUpperCase());
        }

        capitalize(value) {
            if (!value) {
                return '';
            }

            return value.charAt(0).toUpperCase() + value.slice(1);
        }

        getMetadata() {
            return this.view.getMetadata();
        }

        getFieldManager() {
            return this.view.getFieldManager();
        }

        getConfig() {
            return this.view.getConfig();
        }

        getLanguage() {
            return this.view.getLanguage();
        }

        translate(...args) {
            return this.view.translate(...args);
        }
    };
});

import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Sortable from "./Sortable";
import Envelope from "./Envelope";
import { connect } from "react-redux";
import { selectors } from "@neos-project/neos-ui-redux-store";
import { neos } from "@neos-project/neos-ui-decorators";
import { IconButton, Icon, Button, Label } from "@neos-project/react-ui-components";
import style from "./style.module.css";
import { SortableHandle } from "react-sortable-hoc";
import { arrayMoveImmutable } from "array-move";
import backend from "@neos-project/neos-ui-backend-connector";
import { deepMerge, set, isNumeric } from "./helper";

const getDataLoaderOptionsForProps = (props) => ({
    contextNodePath: props.focusedNodePath,
    dataSourceIdentifier: props.options.dataSourceIdentifier,
    dataSourceUri: props.options.dataSourceUri,
    dataSourceAdditionalData: props.options.dataSourceAdditionalData,
    dataSourceDisableCaching: Boolean(props.options.dataSourceDisableCaching),
});

function Repeatable(props) {
    const {
        commit,
        dataSourcesDataLoader,
        editorRegistry,
        i18nRegistry,
        id,
        validatorRegistry,
        value,
        renderHelpIcon,
    } = props;
    const { dataSourceIdentifier, dataSourceUri, dataSourceAdditionalData } = props.options;
    const hasDataSource = !!(dataSourceIdentifier || dataSourceUri);

    const label = i18nRegistry.translate(props.label);
    const [isLoading, setLoading] = useState(true);
    const [dataTypes, setDataTypes] = useState({});
    const [allowAdd, setAllowAdd] = useState(true);
    const [allowRemove, setAllowRemove] = useState(true);
    const [currentValue, setCurrentValue] = useState([]);
    const [options, setOptions] = useState(hasDataSource ? null : props.options);
    const [emptyGroup, setEmptyGroup] = useState({});

    // We use this hack to prevent the editor from re-rendering all the time, even if the options are the same.
    const returnCurrentValueAsJSON = () => JSON.stringify(currentValue);
    const [currentValueAsJSON, setCurrentValueAsJSON] = useState([]);

    useEffect(() => {
        setLoading(true);
        backend
            .get()
            .endpoints.dataSource("get-property-types", null, {})
            .then((json) => {
                setDataTypes(json);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        const dataAsJSON = returnCurrentValueAsJSON();
        if (currentValueAsJSON === dataAsJSON || !options) {
            return;
        }
        setCurrentValueAsJSON(dataAsJSON);
        testIfAdd(currentValue);
        testIfRemove(currentValue);
    }, [currentValue]);

    useEffect(() => {
        if (!options) {
            return;
        }
        const group = getEmptyGroup();
        setEmptyGroup(group);
        initialValue(group);
    }, [options, dataTypes]);

    // We use this hack to prevent the editor from re-rendering all the time, even if the options are the same.
    const returnDataSourceOptionsAsJSON = () =>
        JSON.stringify({ dataSourceIdentifier, dataSourceUri, dataSourceAdditionalData });
    const [dataSourceOptionsAsJSON, setDataSourceOptionsAsJSON] = useState(null);
    useEffect(() => {
        if (!hasDataSource) {
            return;
        }
        const dataAsJSON = returnDataSourceOptionsAsJSON();
        if (dataSourceOptionsAsJSON === dataAsJSON) {
            return;
        }
        setLoading(true);
        setDataSourceOptionsAsJSON(dataAsJSON);

        dataSourcesDataLoader.resolveValue(getDataLoaderOptionsForProps(props), currentValue).then((values) => {
            setOptions(deepMerge(props.options, values));
            setLoading(false);
        });
    }, [dataSourceIdentifier, dataSourceUri, dataSourceAdditionalData]);

    function getEmptyGroup() {
        let group = {};
        const properties = options.properties;
        if (properties) {
            Object.entries(properties).forEach(([property, item]) => {
                const defaultValue = item && item.defaultValue;
                group[property] = returnValueIfSet(defaultValue, "");
            });
        }
        return group;
    }

    function initialValue(group) {
        let newValue = value ? [...value] : [];
        const { min, max } = options;

        if (min) {
            if (newValue.length < min) {
                for (var i = 0; i < min; ++i) {
                    if (newValue[i]) {
                        newValue[i] = value[i];
                    } else {
                        newValue[i] = group;
                    }
                }
            }
        }
        if (max && newValue.length > max) {
            newValue = newValue.slice(0, max);
        }

        if (newValue.length) {
            for (let key = 0; key < newValue.length; key++) {
                const predefined = options.predefinedProperties?.[key]?.properties;
                const currentEntry = { ...newValue[key] };
                const availableKeys = Object.keys(currentEntry).filter((key) => key in group);
                const cleanedUpEntry = availableKeys.reduce((cur, keyname) => {
                    const isPredefined = predefined?.[keyname]?.defaultValue != undefined;
                    let value = isPredefined ? predefined[keyname].defaultValue : currentEntry[keyname];
                    if (isNumeric(value)) {
                        value = parseFloat(value);
                    }

                    return {
                        ...cur,
                        [keyname]: value,
                    };
                }, {});
                newValue[key] = cleanedUpEntry;
            }
        }
        setCurrentValue(newValue);
    }

    function handleValueChange(value) {
        commit(value);
        setCurrentValue(value);
    }

    function testIfAdd(value) {
        if (options && options.max) {
            setAllowAdd(options.max > value.length);
        }
    }

    function testIfRemove(value) {
        if (options && options.min) {
            setAllowRemove(options.min < value.length);
        }
    }

    function handleAdd() {
        handleValueChange([...currentValue, emptyGroup]);
    }

    function handleRemove(idx) {
        const value = currentValue.filter((s, sidx) => idx !== sidx);
        handleValueChange(value);
    }

    function commitChange(idx, property, event) {
        handleValueChange(set(property, event, currentValue));
    }

    function validateElement(elementValue, elementConfiguration, idx, identifier) {
        if (!elementConfiguration || !elementConfiguration.validation) {
            return;
        }
        const validators = elementConfiguration.validation;
        const validationResults = Object.keys(validators).map((validatorName) => {
            const validatorConfiguration = validators[validatorName];
            return checkValidator(elementValue, validatorName, validatorConfiguration);
        });
        const validationResultsArray = validationResults.filter((result) => result);
        if (options.controls && options.controls.add) {
            setAllowAdd(validationResultsArray.length <= 0);
        }
        return validationResultsArray;
    }

    function checkValidator(elementValue, validatorName, validatorConfiguration) {
        const validator = validatorRegistry.get(validatorName);
        if (validator) {
            return validator(elementValue, validatorConfiguration);
        }
        console.warn(`Validator ${validatorName} not found`);
    }

    function createElement(idx) {
        const isPredefined = !!options.predefinedProperties && options.predefinedProperties[idx];
        const { controls } = options;
        const DragHandle = SortableHandle(() => (
            <span type="button" className={style.move}>
                <Icon icon="sort" />
            </span>
        ));

        return (
            <div className={style.wrapper}>
                <div class={style.buttons}>
                    {!isPredefined && controls && controls.move && currentValue.length > 1 && <DragHandle />}
                    {!isPredefined && controls && controls.remove && allowRemove && (
                        <IconButton onClick={() => handleRemove(idx)} className={style.delete} icon="trash" />
                    )}
                </div>
                {getProperties(idx)}
            </div>
        );
    }

    function getProperties(idx) {
        const { predefinedProperties } = options;
        const groupLabel = predefinedProperties && predefinedProperties[idx] ? predefinedProperties[idx].label : null;
        const properties = [];
        Object.keys(emptyGroup).map((property) => {
            properties.push(getProperty(property, idx));
        });
        // TODO Do we need this? <td dangerouslySetInnerHTML={{ __html: this.state.actions }} />
        return (
            <div className="group">
                {groupLabel && <span dangerouslySetInnerHTML={{ __html: groupLabel }} />}
                {properties}
            </div>
        );
    }

    function checkIfValueIsSet(value) {
        return !!(value !== null && value !== undefined);
    }

    function returnValueIfSet(value, fallback = "") {
        return checkIfValueIsSet(value) ? value : fallback;
    }

    function getProperty(property, idx) {
        const repeatableValue = [...currentValue];
        const { properties, predefinedProperties } = options;
        let propertyDefinition = properties[property];
        if (
            predefinedProperties &&
            predefinedProperties[idx] &&
            predefinedProperties[idx].properties &&
            predefinedProperties[idx].properties[property]
        ) {
            propertyDefinition = deepMerge(propertyDefinition, predefinedProperties[idx]["properties"][property]);
        }
        const defaultDataType = propertyDefinition.type ? dataTypes[propertyDefinition.type] : {};
        if (defaultDataType) {
            propertyDefinition = deepMerge(defaultDataType, propertyDefinition);
        }

        let editorOptions = returnValueIfSet(propertyDefinition.editorOptions, {});
        const editor = returnValueIfSet(propertyDefinition.editor, "Neos.Neos/Inspector/Editors/TextFieldEditor");
        let value = returnValueIfSet(repeatableValue[idx][property]);

        if (!value && checkIfValueIsSet(propertyDefinition.defaultValue)) {
            value = propertyDefinition.defaultValue;
        }

        if (editorOptions.hasOwnProperty("dataSourceUri") || editorOptions.hasOwnProperty("dataSourceIdentifier")) {
            editorOptions = { ...editorOptions };
            if (!editorOptions.dataSourceAdditionalData) {
                editorOptions.dataSourceAdditionalData = {};
            } else {
                if (editorOptions.dataSourceAdditionalData.hasOwnProperty("repeatableIndex")) {
                    editorOptions.dataSourceAdditionalData["repeatableIndex"] = idx;
                }
                if (editorOptions.dataSourceAdditionalData.hasOwnProperty("repeatableValue")) {
                    editorOptions.dataSourceAdditionalData["repeatableValue"] = currentValue;
                }
            }
        }
        return (
            <div className={style.property} hidden={propertyDefinition.hidden}>
                <Envelope
                    identifier={`repeatable-${idx}-${property}`}
                    // label={propertyDefinition.label?propertyDefinition.label:''}
                    options={editorOptions}
                    value={value}
                    renderSecondaryInspector={props.renderSecondaryInspector}
                    editor={editor}
                    editorRegistry={editorRegistry}
                    i18nRegistry={i18nRegistry}
                    validationErrors={validateElement(value, propertyDefinition, idx, property)}
                    highlight={false}
                    property={`${idx}.${property}`}
                    id={`repeatable-${idx}-${property}`}
                    commit={commitChange}
                    {...propertyDefinition}
                />
            </div>
        );
    }

    function onSortAction({ oldIndex, newIndex }) {
        handleValueChange(arrayMoveImmutable(currentValue, oldIndex, newIndex));
    }

    if (isLoading || !options) {
        return (
            <>
                <Label htmlFor={id}>
                    {label} {renderHelpIcon()}
                </Label>
                <div id={id} className={style.loading} title={i18nRegistry.translate("Neos.Neos:Main:loading")}>
                    <Icon icon="spinner" size="lg" spin />
                </div>
            </>
        );
    }

    if (options.hidden) {
        return null;
    }

    const { buttonAddLabel = "Mireo.RepeatableFields:Main:addRow" } = options;

    return (
        <>
            <Label htmlFor={id}>
                {label} {renderHelpIcon()}
            </Label>
            <Sortable element={createElement} items={currentValue} onSortEndAction={onSortAction} />
            {options.controls.add && allowAdd && (
                <Button onClick={handleAdd}>{i18nRegistry.translate(buttonAddLabel)}</Button>
            )}
        </>
    );
}
Repeatable.propTypes = {
    identifier: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    // options: PropTypes.object,
    value: PropTypes.arrayOf(PropTypes.object),
    renderSecondaryInspector: PropTypes.func,
    editor: PropTypes.string.isRequired,
    editorRegistry: PropTypes.object.isRequired,
    i18nRegistry: PropTypes.object.isRequired,
    validationErrors: PropTypes.array,
    onEnterKey: PropTypes.func,
    helpMessage: PropTypes.string,
    helpThumbnail: PropTypes.string,
    highlight: PropTypes.bool,

    commit: PropTypes.func.isRequired,
    options: PropTypes.shape({
        hidden: PropTypes.bool,
        buttonAddLabel: PropTypes.string,
        dataSourceIdentifier: PropTypes.string,
        dataSourceUri: PropTypes.string,
        dataSourceDisableCaching: PropTypes.bool,
        dataSourceAdditionalData: PropTypes.objectOf(PropTypes.any),
        predefinedProperties: PropTypes.arrayOf(
            PropTypes.shape({
                label: PropTypes.string,
                value: PropTypes.object,
            }),
        ),
        max: PropTypes.number,
        min: PropTypes.number,
        controls: PropTypes.shape({
            move: PropTypes.bool,
            remove: PropTypes.bool,
            add: PropTypes.bool,
        }),
        //
        // 	properties: PropTypes.objectOf(
        // 		PropTypes.object()
        // 	),
        //
        // 	placeholder: PropTypes.integersOnly,
        // 	// disabled: PropTypes.bool,
        // 	//
        // 	// multiple: PropTypes.bool,
        //
        // 	dataSourceIdentifier: PropTypes.string,
        // 	dataSourceUri: PropTypes.string,
        // 	dataSourceDisableCaching: PropTypes.bool,
        // 	dataSourceAdditionalData: PropTypes.objectOf(PropTypes.any),
        //
        // 	// minimumResultsForSearch: PropTypes.number,
        //
        // properties: PropTypes.objectOf(
        // 	PropTypes.shape({
        // 		label: PropTypes.string,
        // 		icon: PropTypes.string,
        // 		preview: PropTypes.string,
        //
        // 		// TODO
        // 		group: PropTypes.string
        // 	})
        // )
        //
    }).isRequired,
    dataSourcesDataLoader: PropTypes.shape({
        resolveValue: PropTypes.func.isRequired,
    }).isRequired,
    focusedNodePath: PropTypes.string.isRequired,
};

const neosifier = neos((globalRegistry) => ({
    editorRegistry: globalRegistry.get("inspector").get("editors"),
    i18nRegistry: globalRegistry.get("i18n"),
    dataSourcesDataLoader: globalRegistry.get("dataLoaders").get("DataSources"),
}));
const connector = connect((state) => ({
    focusedNodePath: selectors.CR.Nodes.focusedNodePathSelector(state),
}));
export default neosifier(connector(Repeatable));
import React, {PureComponent} from 'react';
import PropTypes from 'prop-types';
import style from '../style.css';
import {neos} from '@neos-project/neos-ui-decorators';
import {$get, $set, $transform, $merge} from 'plow-js';
import {actions} from '@neos-project/neos-ui-redux-store';
import {connect} from 'react-redux';
import {
    sortableContainer,
    sortableElement,
    sortableHandle,
} from 'react-sortable-hoc';
import backend from '@neos-project/neos-ui-backend-connector';
import arrayMove from 'array-move'

const defaultOptions = {
    autoFocus: false,
    disabled: false,
    maxlength: null,
    readonly: false,
    buttonAddLabel: 'Add row',
    controls: {
        move: true,
        remove: true,
        add: true
    }
};

@neos(globalRegistry => ({
    i18nRegistry: globalRegistry.get('i18n'),
    secondaryEditorsRegistry: globalRegistry.get('inspector').get('secondaryEditors')
}))

export default class RepeatableField extends PureComponent {
    static propTypes = {
        value: PropTypes.arrayOf( PropTypes.object ),
        commit: PropTypes.func.isRequired,
        validationErrors: PropTypes.array,
        highlight: PropTypes.bool,
        options: PropTypes.object,
        onKeyPress: PropTypes.func,
        onEnterKey: PropTypes.func,
        id: PropTypes.string,
        i18nRegistry: PropTypes.object.isRequired
    };

    constructor(props) {
        super(props);
        // this.endpoint = false;
        // this.state = {
        //     fields: []
        // };
        this.init();
    }

    init = () => {
        const {options} = this.props;
        this.options = Object.assign({}, defaultOptions, options);
        // this.handleValueChange(value);
        this.getFromEndpoint();
    }

    async getFromEndpoint(){
        if( !$get('options.endpointData.url', this.props) && !$get('options.endpointData.dataSourceIdentifier', this.props) )
            return;

        var params = $get('options.endpointData.params', this.props);
        if( $get('options.endpointData.dataSourceIdentifier', this.props) )
            params['node'] = sessionStorage['Neos.Neos.lastVisitedNode'];
        const {dataSource} = backend.get().endpoints;
        dataSource(
            $get('options.endpointData.dataSourceIdentifier', this.props)?$get('options.endpointData.dataSourceIdentifier', this.props):null,
            $get('options.endpointData.url', this.props)?$get('options.endpointData.url', this.props):null,
            params
        ).then((json) => {
            if(!json)
                return;
            var length = json.length;
            var values = [];
            var currentValues = this.props.value?JSON.parse(this.props.value):[];
            for( var i=0; i<length; i++){
                var fieldsArray = Object.keys(this.props.options.fields);
                values[i] = {};
                fieldsArray.map((identifier, idx) => {
                    var valueIdentifier = $get(`options.endpointData.parseValues.${identifier}`, this.props);
                    var value = valueIdentifier?$get(valueIdentifier, json[i]):null;
                    var currentValue = currentValues?$get(identifier, currentValues[i]):'';
                    if(currentValue && !valueIdentifier)
                        values[i][identifier] = currentValue;
                    else
                        values[i][identifier] = value?value:'';
                    if( i+1===length && idx+1===fieldsArray.length){
                        this.handleValueChange(values);
                    }
                });
            }
        });
    }

    getValue(){
        const {value} = this.props;
        return value?JSON.parse(value):[];
    }

    getEmptyValue = () => {
        if( this.empytValue )
            return this.empytValue;
        const {options} = this.props;
        var fields = options.fields;
        const length = fields.length;
        this.empytValue = {};
        Object.keys(fields).map((value => {
            this.empytValue[value] = '';
        }));
        return this.empytValue;
    }

    handleValueChange(value) {
        this.props.commit(JSON.stringify(value));
    };

    handleAdd = () => {
        var value = this.getValue();

        value = [...value, this.getEmptyValue()];
        this.handleValueChange(value);
    };

    handleRemove = (idx) => {
        var value = this.getValue().filter((s, sidx) => idx !== sidx);
        this.handleValueChange(value);
    }

    getEditorDefinition( idx, identifier ) {
        const {editorRegistry, options} = this.props;
        const fields = this.getValue();

        const field = $get('fields.'+identifier, options);

        const commitChange = (event) =>{
            var value = this.getValue();
            value[idx][identifier] = event;
            this.handleValueChange(value);
        };

        const editorDefinition = editorRegistry.get(field.editor?field.editor:'Neos.Neos/Inspector/Editors/TextFieldEditor');

        if (editorDefinition && editorDefinition.component) {
            var EditorComponent = editorDefinition && editorDefinition.component;
            const editorOptions = field.editorOptions;
            const propertyValue = fields[idx][identifier];

            // console.log(this.props);

            return (
                    <div>
                        {field.label?<label>{field.label}</label>:''}
                        <EditorComponent
                            id={`repetable-${idx}-${identifier}`}
                            name={`[${idx}]${identifier}`}
                            commit={commitChange.bind(this)}
                            // onChange={commitChange()}
                            // onchange={commitChange()}
                            // onChangeValue={commitChange()}
                            value={propertyValue}
                            options = {editorOptions?editorOptions:[]}
                            neos = {this.props.neos}
                            // editorRegistry = {this.props.editorRegistry}
                            renderSecondaryInspector = {this.props.renderSecondaryInspector}
                            // nodeTypesRegistry = {this.props.nodeTypesRegistry}
                            // i18nRegistry = {this.props.i18nRegistry}
                            // validatorRegistry = {this.props.validatorRegistry}
                            {...field}
                        />
                    </div>

                    // {...restProps} />
                );
        }

        return (<div className={style['envelope--invalid']}>Missing Editor {'error'}</div>);
    }

    repetableWrapper = (idx) => {
        const {options} = this;

        const DragHandle = sortableHandle(() => <span type="button" className={style['btn-move']}>=</span>);

        return (
            <div className={style['repeatable-wrapper']}>
                {options.controls.move && this.getValue().length>1?(<DragHandle />):''}
                <div className={style['repeatable-field-wrapper']}>
                    {Object.keys(options.fields).map( (identifier) => {
                        return this.getEditorDefinition(idx, identifier)
                    })}
                </div>
                {options.controls.remove?(<button type="button" onClick={() => this.handleRemove(idx)} className={style['btn-delete']}>-</button>):''}
            </div>
        );
    }

    onSortEnd = ({oldIndex, newIndex}) => {
        this.handleValueChange(arrayMove(this.getValue(), oldIndex, newIndex))
    };

    render() {
        const {options} = this;

        const SortableItem = sortableElement(({value}) => (
            <div>
                {value}
            </div>
        ));

        const SortableContainer = sortableContainer(({children}) => {
            return <div>{children}</div>;
        });

        return (
            <div>
                <SortableContainer onSortEnd={this.onSortEnd} useDragHandle>
                {this.getValue().map((fields, idx) => (
                    // this.repetableWrapper(idx)
                        <SortableItem key={`item-${idx}`} index={idx} value={this.repetableWrapper(idx)} />
                    )
                )}
                </SortableContainer>
                {options.controls.add?(<button type="button" onClick={() => this.handleAdd()} className={style.btn}>{options.buttonAddLabel}</button>):''}
            </div>
        )
    }
}
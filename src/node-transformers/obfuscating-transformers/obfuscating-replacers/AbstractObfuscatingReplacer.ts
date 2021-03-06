import { inject, injectable, } from 'inversify';
import { ServiceIdentifiers } from '../../../container/ServiceIdentifiers';

import * as ESTree from 'estree';

import { TNodeWithBlockScope } from '../../../types/node/TNodeWithBlockScope';

import { IObfuscatingReplacer } from '../../../interfaces/node-transformers/obfuscating-transformers/obfuscating-replacers/IObfuscatingReplacer';
import { IOptions } from '../../../interfaces/options/IOptions';

@injectable()
export abstract class AbstractObfuscatingReplacer implements IObfuscatingReplacer {
    /**
     * @type {IOptions}
     */
    protected readonly options: IOptions;

    /**
     * @param {IOptions} options
     */
    constructor (
        @inject(ServiceIdentifiers.IOptions) options: IOptions
    ) {
        this.options = options;
    }

    /**
     * @param {SimpleLiteral["value"]} nodeValue
     * @param {TNodeWithBlockScope} blockScopeNode
     * @returns {Node}
     */
    public abstract replace (nodeValue: ESTree.SimpleLiteral['value'], blockScopeNode?: TNodeWithBlockScope): ESTree.Node;
}

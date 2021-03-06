import { inject, injectable, } from 'inversify';
import { ServiceIdentifiers } from '../../container/ServiceIdentifiers';

import * as estraverse from 'estraverse';
import * as ESTree from 'estree';

import { TIdentifierObfuscatingReplacerFactory } from '../../types/container/node-transformers/TIdentifierObfuscatingReplacerFactory';
import { TNodeWithBlockScope } from '../../types/node/TNodeWithBlockScope';

import { IIdentifierObfuscatingReplacer } from '../../interfaces/node-transformers/obfuscating-transformers/obfuscating-replacers/IIdentifierObfuscatingReplacer';
import { IOptions } from '../../interfaces/options/IOptions';
import { IRandomGenerator } from '../../interfaces/utils/IRandomGenerator';
import { IVisitor } from '../../interfaces/node-transformers/IVisitor';

import { IdentifierObfuscatingReplacer } from '../../enums/node-transformers/obfuscating-transformers/obfuscating-replacers/IdentifierObfuscatingReplacer';
import { TransformationStage } from '../../enums/node-transformers/TransformationStage';

import { AbstractNodeTransformer } from '../AbstractNodeTransformer';
import { NodeGuards } from '../../node/NodeGuards';
import { NodeMetadata } from '../../node/NodeMetadata';
import { NodeUtils } from '../../node/NodeUtils';

/**
 * replaces:
 *     function foo (argument1) { return argument1; };
 *
 * on:
 *     function foo (_0x12d45f) { return _0x12d45f; };
 *
 */
@injectable()
export class FunctionTransformer extends AbstractNodeTransformer {
    /**
     * @type {IIdentifierObfuscatingReplacer}
     */
    private readonly identifierObfuscatingReplacer: IIdentifierObfuscatingReplacer;

    /**
     * @param {TIdentifierObfuscatingReplacerFactory} identifierObfuscatingReplacerFactory
     * @param {IRandomGenerator} randomGenerator
     * @param {IOptions} options
     */
    constructor (
        @inject(ServiceIdentifiers.Factory__IIdentifierObfuscatingReplacer)
            identifierObfuscatingReplacerFactory: TIdentifierObfuscatingReplacerFactory,
        @inject(ServiceIdentifiers.IRandomGenerator) randomGenerator: IRandomGenerator,
        @inject(ServiceIdentifiers.IOptions) options: IOptions
    ) {
        super(randomGenerator, options);

        this.identifierObfuscatingReplacer = identifierObfuscatingReplacerFactory(
            IdentifierObfuscatingReplacer.BaseIdentifierObfuscatingReplacer
        );
    }

    /**
     * @param {TransformationStage} transformationStage
     * @returns {IVisitor | null}
     */
    public getVisitor (transformationStage: TransformationStage): IVisitor | null {
        switch (transformationStage) {
            case TransformationStage.Obfuscating:
                return {
                    enter: (node: ESTree.Node, parentNode: ESTree.Node | null) => {
                        if (
                            parentNode && (
                                NodeGuards.isFunctionDeclarationNode(node) ||
                                NodeGuards.isFunctionExpressionNode(node) ||
                                NodeGuards.isArrowFunctionExpressionNode(node)
                            )
                        ) {
                            return this.transformNode(node, parentNode);
                        }
                    }
                };

            default:
                return null;
        }
    }

    /**
     * @param {Function} functionNode
     * @param {NodeGuards} parentNode
     * @returns {NodeGuards}
     */
    public transformNode (functionNode: ESTree.Function, parentNode: ESTree.Node): ESTree.Node {
        const blockScopeNode: TNodeWithBlockScope = NodeGuards.isBlockStatementNode(functionNode.body)
            ? functionNode.body
            : NodeUtils.getBlockScopeOfNode(functionNode.body);

        this.storeFunctionParams(functionNode, blockScopeNode);
        this.replaceFunctionParams(functionNode, blockScopeNode);

        return functionNode;
    }

    /**
     * @param {Function} functionNode
     * @param {TNodeWithBlockScope} blockScopeNode
     */
    private storeFunctionParams (functionNode: ESTree.Function, blockScopeNode: TNodeWithBlockScope): void {
        functionNode.params
            .forEach((paramsNode: ESTree.Node) => {
                estraverse.traverse(paramsNode, {
                    enter: (node: ESTree.Node): estraverse.VisitorOption | void => {
                        if (NodeGuards.isPropertyNode(paramsNode)) {
                            return estraverse.VisitorOption.Skip;
                        }

                        if (NodeGuards.isAssignmentPatternNode(node) && NodeGuards.isIdentifierNode(node.left)) {
                            this.identifierObfuscatingReplacer.storeLocalName(node.left.name, blockScopeNode);

                            return estraverse.VisitorOption.Skip;
                        }

                        if (NodeGuards.isIdentifierNode(node)) {
                            this.identifierObfuscatingReplacer.storeLocalName(node.name, blockScopeNode);
                        }
                    }
                });
            });
    }

    /**
     * @param {Property[]} properties
     * @param {Set<string>} ignoredIdentifierNamesSet
     */
    private addIdentifiersToIgnoredIdentifierNamesSet (
        properties: ESTree.Property[],
        ignoredIdentifierNamesSet: Set<string>
    ): void {
        properties.forEach((property: ESTree.Property) => {
            if (!property.key || !NodeGuards.isIdentifierNode(property.key)) {
                return;
            }

            ignoredIdentifierNamesSet.add(property.key.name);
        });
    }

    /**
     * @param {Function} functionNode
     * @param {TNodeWithBlockScope} blockScopeNode
     */
    private replaceFunctionParams (functionNode: ESTree.Function, blockScopeNode: TNodeWithBlockScope): void {
        const ignoredIdentifierNamesSet: Set<string> = new Set();

        const replaceVisitor: estraverse.Visitor = {
            enter: (node: ESTree.Node, parentNode: ESTree.Node | null): void => {
                if (NodeGuards.isObjectPatternNode(node)) {
                    this.addIdentifiersToIgnoredIdentifierNamesSet(node.properties, ignoredIdentifierNamesSet);
                }

                if (
                    parentNode &&
                    NodeGuards.isReplaceableIdentifierNode(node, parentNode) &&
                    !ignoredIdentifierNamesSet.has(node.name)
                ) {
                    const newIdentifier: ESTree.Identifier = this.identifierObfuscatingReplacer
                        .replace(node.name, blockScopeNode);
                    const newIdentifierName: string = newIdentifier.name;

                    if (node.name !== newIdentifierName) {
                        node.name = newIdentifierName;
                        NodeMetadata.set(node, { renamedIdentifier: true });
                    }
                }
            }
        };

        functionNode.params.forEach((paramsNode: ESTree.Node) => estraverse.replace(paramsNode, replaceVisitor));

        estraverse.replace(functionNode.body, replaceVisitor);
    }
}

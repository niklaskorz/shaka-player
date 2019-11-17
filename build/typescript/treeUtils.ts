import * as doctrine from "@teppeis/doctrine";
import { Definition, ParamTypes } from "./base";
import assert from "./assert";

export interface Node {
  name: string;
  definition?: Definition;
  children: Map<string, Node>;
}

export type NodeMap = Map<string, Node>;

export function getOrCreateNode(nodes: NodeMap, name: string): Node {
  if (nodes.has(name)) {
    return nodes.get(name)!;
  }
  const node = {
    name: name,
    children: new Map()
  };
  nodes.set(name, node);
  return node;
}

export function getOrCreateNodeAtPath(root: NodeMap, path: string[]): Node {
  assert(path.length > 0);
  let node = null;
  let nodes = root;
  for (const part of path) {
    node = getOrCreateNode(nodes, part);
    nodes = node.children;
  }
  return node!;
}

export function getNodeAtPath(root: NodeMap, path: string[]): Node | null {
  let nodes = root;
  let node = null;
  for (const part of path) {
    node = nodes.get(part);
    if (!node) {
      return null;
    }
    nodes = node.children;
  }
  return node;
}

export interface PropType {
  rawType?: doctrine.Type;
  isConst: boolean;
}

export function getPropTypeFromInterface(
  iface: Node,
  propName: string
): PropType {
  assert(iface.definition);
  const attributes = iface.definition.attributes;
  assert(attributes);
  if (attributes.type === "interface") {
    const base = getNodeAtPath(iface.children, ["prototype", propName]);
    if (base) {
      assert(base.definition);
      const baseAttributes = base.definition.attributes;
      assert(baseAttributes);
      const isConst = baseAttributes.type === "const";
      return {
        rawType: isConst ? baseAttributes.constType : baseAttributes.propType,
        isConst: isConst
      };
    }
  } else if (attributes.type === "typedef" && attributes.props) {
    const base = attributes.props.find(p => p.name === propName);
    assert(base);
    return {
      rawType: base.type,
      isConst: false
    };
  }

  return {
    isConst: false
  };
}

interface MethodTypes {
  paramTypes?: ParamTypes;
  returnType?: doctrine.Type;
}

export function getMethodTypesFromInterface(
  iface: Node,
  methodName: string
): MethodTypes {
  assert(iface.definition);
  const attributes = iface.definition.attributes;
  assert(attributes);
  if (attributes.type === "interface") {
    const base = getNodeAtPath(iface.children, ["prototype", methodName]);
    if (base) {
      assert(base.definition);
      const baseAttributes = base.definition.attributes;
      assert(baseAttributes);
      return {
        paramTypes: baseAttributes.paramTypes,
        returnType: baseAttributes.returnType
      };
    }
  } else if (attributes.type === "typedef" && attributes.props) {
    const base = attributes.props.find(p => p.name === methodName);
    assert(base);
    if (base.type.type === doctrine.Syntax.FunctionType) {
      return {
        paramTypes: base.type.params.reduce((acc: ParamTypes, type, i) => {
          acc["p" + i] = type;
          return acc;
        }, {}),
        returnType: base.type.result || undefined
      };
    }
  }

  return {};
}

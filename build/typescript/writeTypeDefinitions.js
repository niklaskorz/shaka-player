const generateType = require('./generateType');

class AbstractWriter {
  constructor() {
    this.level = 0;
  }

  increaseLevel() {
    this.level++;
  }

  decreaseLevel() {
    this.level--;
  }

  getIndentation() {
    // Repeat two spaces 'level'-times for indentation
    return '  '.repeat(this.level);
  }
}

class StringWriter extends AbstractWriter {
  constructor() {
    super();
    this.buffer = '';
  }

  writeLine(str) {
    this.buffer += this.getIndentation() + str + '\n';
  }
}

class StreamWriter extends AbstractWriter {
  constructor(stream) {
    super();
    this.stream = stream;
  }

  writeLine(str) {
    this.stream.write(this.getIndentation() + str + '\n');
  }
}

function getNodeAtPath(root, path) {
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

function writeClassNode(writer, root, node) {
  const staticProperties = [];
  const staticMethods = [];
  const properties = [];
  const methods = [];
  const others = [];
  // Class might consist of only a constructor
  // Prototype defaults to empty in that case
  const prototype = node.children.get('prototype') || { children: new Map() };

  // Gather all static members
  for (const child of node.children.values()) {
    if (child.name === 'prototype') {
      continue;
    }
    console.assert(
      child.definition !== null,
      'Unexpected child without definition in class definition:',
      child
    );

    const type = child.definition.attributes.type || child.definition.type;
    switch (type) {
      case 'const':
        staticProperties.push(child);
        break;
      case 'property':
        staticProperties.push(child);
        break;
      case 'function':
        staticMethods.push(child);
        break;
      default:
        others.push(child);
    }
  }

  // Gather all prototype members
  for (const child of prototype.children.values()) {
    console.assert(
      child.definition !== null,
      'Unexpected child without definition in class definition:',
      child
    );

    const type = child.definition.attributes.type || child.definition.type;
    switch (child.definition.type) {
      case 'const':
        properties.push(child);
        break;
      case 'property':
        properties.push(child);
        break;
      case 'function':
        methods.push(child);
        break;
      default:
        console.error(
          'Found unexpected node type', type, 'in class definition'
        );
    }
  }

  const attributes = node.definition.attributes;
  let classDeclaration = node.name;
  if (attributes.extends) {
    classDeclaration += ' extends ' + attributes.extends;
  }
  if (attributes.implements) {
    classDeclaration += ' implements ' + attributes.implements;
  }
  writer.writeLine(`class ${classDeclaration} {`);
  writer.increaseLevel();

  // Static properties
  for (const propNode of staticProperties) {
    const attributes = propNode.definition.attributes;
    const isConst = attributes.type === 'const';
    const rawType = isConst ? attributes.constType : attributes.propType;
    const type = generateType(rawType);
    writer.writeLine(
      `static ${isConst ? 'readonly ' : ''}${propNode.name}: ${type};`
    );
  }

  // Static methods
  for (const methodNode of staticMethods) {
    writeFunctionNode(writer, methodNode, 'static');
  }

  // Properties
  for (const propNode of properties) {
    const attributes = propNode.definition.attributes;
    const isConst = attributes.type === 'const';
    const rawType = isConst ? attributes.constType : attributes.propType;
    const type = generateType(rawType);
    writer.writeLine(
      `${isConst ? 'readonly ' : ''}${propNode.name}: ${type};`
    );
  }

  // Constructor
  writeFunctionNode(writer, node, null, true);

  // Methods
  for (const methodNode of methods) {
    writeFunctionNode(writer, methodNode, null);
  }

  writer.decreaseLevel();
  writer.writeLine('}');

  if (others.length > 0) {
    writer.writeLine(`namespace ${node.name} {`);
    writer.increaseLevel();
    writeNodes(writer, root, others);
    writer.decreaseLevel();
    writer.writeLine('}');
  }
}

function writeInterfaceNode(writer, root, node) {
  const properties = [];
  const methods = [];
  const others = [];
  const prototype = node.children.get('prototype');
  const attributes = node.definition.attributes;
  const baseInterface = attributes.extends;

  // Gather all non-prototype members
  for (const child of node.children.values()) {
    if (child.name === 'prototype') {
      continue;
    }
    console.assert(
      child.definition !== null,
      'Unexpected child without definition in interface definition:',
      child
    );
    others.push(child);
  }

  // Gather all prototype members
  for (const child of prototype.children.values()) {
    console.assert(
      child.definition !== null,
      'Unexpected child without definition in interface definition:',
      child
    );

    const type = child.definition.attributes.type || child.definition.type;
    switch (child.definition.type) {
      case 'const':
        properties.push(child);
        break;
      case 'property':
        properties.push(child);
        break;
      case 'function':
        methods.push(child);
        break;
      default:
        console.error(
          'Found unexpected node type', type, 'in interface definition'
        );
    }
  }


  writeComments(writer, attributes.comments);
  if (baseInterface) {
    writer.writeLine(`interface ${node.name} extends ${baseInterface} {`);
  } else {
    writer.writeLine(`interface ${node.name} {`);
  }
  writer.increaseLevel();

  // Properties
  for (const propNode of properties) {
    const attributes = propNode.definition.attributes;
    const isConst = attributes.type === 'const';
    const rawType = isConst ? attributes.constType : attributes.propType;
    const type = generateType(rawType);
    writer.writeLine(
      `${isConst ? 'readonly ' : ''}${propNode.name}: ${type};`
    );
  }

  // Methods
  for (const methodNode of methods) {
    writeFunctionNode(writer, methodNode, null);
  }

  writer.decreaseLevel();
  writer.writeLine('}');

  if (others.length > 0) {
    writer.writeLine(`namespace ${node.name} {`);
    writer.increaseLevel();
    writeNodes(writer, root, others);
    writer.decreaseLevel();
    writer.writeLine('}');
  }
}

function writeTypedefNode(writer, root, node) {
  const attributes = node.definition.attributes;

  writeComments(writer, attributes.comments);
  if (attributes.props) {
    // Typedef defines an object structure, declare as interface
    writer.writeLine(`interface ${node.name} {`);
    writer.increaseLevel();

    for (const prop of attributes.props) {
      const type = generateType(prop.type);
      if (prop.description) {
        writeComments(writer, [prop.description]);
      }
      writer.writeLine(`${prop.name}: ${type};`);
    }

    writer.decreaseLevel();
    writer.writeLine('}');
  } else {
    const type = generateType(attributes.typedefType);
    writer.writeLine(`type ${node.name} = ${type};`);
  }
}

function writeFunctionNode(
  writer,
  node,
  keyword = 'function',
  isConstructor = false
) {
  const attributes = node.definition.attributes;
  const paramTypes = attributes.paramTypes || {};

  writeComments(writer, attributes.comments);

  const params = node.definition.params.map((name) => {
    const type = paramTypes[name] || 'any';
    console.assert(
      type !== undefined,
      'Missing type information for parameter',
      name,
      'in function',
      node.definition.identifier.join('.')
    );
    return `${name}: ${generateType(type)}`;
  }).join(', ');

  const returnType = attributes.returnType
    ? generateType(attributes.returnType)
    : 'void';

  const name = isConstructor ? 'constructor' : node.name;

  writer.writeLine(
    (keyword ? keyword + ' ' : '') +
    `${name}(${params})` +
    (isConstructor ? ';' : `: ${returnType};`)
  );
}

function writeEnumNode(writer, node) {
  const definition = node.definition;
  console.assert(
    definition.type === 'object',
    'Expected enum',
    node.name,
    'to be defined with an object, got',
    definition.type
  );
  writeComments(writer, definition.attributes.comments);
  writer.writeLine(`enum ${node.name} {`);
  writer.increaseLevel();
  for (const prop of definition.props) {
    writer.writeLine(prop + ',');
  }
  writer.decreaseLevel();
  writer.writeLine(`}`);
}

function writeComments(writer, comments) {
  // TODO: Handle max line length and newlines in comment
  if (comments.length > 0) {
    writer.writeLine('/**');
    for (const comment of comments) {
      writer.writeLine(' * ' + comment);
    }
    writer.writeLine(' */');
  }
}

function writeNode(writer, root, node) {
  if (node.definition === null) {
    // Write namespace to writer
    if (writer.level === 0) {
      // Mark top-level namespaces as ambient
      writer.writeLine(`declare namespace ${node.name} {`);
    } else {
      writer.writeLine(`namespace ${node.name} {`);
    }
    writer.increaseLevel();
    writeNodes(writer, root, node.children.values());
    writer.decreaseLevel();
    writer.writeLine('}');
    return;
  }

  const definition = node.definition;
  const attributes = definition.attributes;

  // If the doc comment didn't lead to a type, fall back to the type we got
  // from the declaration itself.
  // Types: const, enum, class, interface, function, property, object
  const type = attributes.type || definition.type;
  switch (type) {
    case 'class':
      writeClassNode(writer, root, node);
      break;
    case 'interface':
      writeInterfaceNode(writer, root, node);
      break;
    case 'typedef':
      writeTypedefNode(writer, root, node);
      break;
    case 'enum':
      writeEnumNode(writer, node);
      break;
    case 'const': {
      writeComments(writer, attributes.comments);
      const constType = generateType(attributes.constType);
      writer.writeLine(`const ${node.name}: ${constType};`);
      break;
    }
    case 'function':
      writeFunctionNode(writer, node);
      break;
    default:
      console.error('Unexpected definition type', type);
  }
}

function writeNodes(writer, root, nodes) {
  for (const node of nodes) {
    writeNode(writer, root, node);
  }
}

function generateTypeDefinitions(definitionRoot) {
  const writer = new StringWriter();
  writeNodes(writer, definitionRoot, definitionRoot.values());
  return writer.buffer;
}

function writeTypeDefinitions(stream, definitionRoot) {
  const writer = new StreamWriter(stream);
  writeNodes(writer, definitionRoot, definitionRoot.values());
}

module.exports = writeTypeDefinitions;

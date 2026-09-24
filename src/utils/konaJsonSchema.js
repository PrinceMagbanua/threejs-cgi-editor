import { parseTree, findNodeAtLocation, getNodeValue } from 'jsonc-parser'

export const KONA_JSON_SCHEMA_URI = 'inmemory://kona-json-schema.json'

// Structural shape of a kona.json-style variant config.
export const KONA_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['lightPositions', 'options', 'objectNames'],
  additionalProperties: false,
  properties: {
    lightPositions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['x', 'y', 'z', 'intensity'],
        additionalProperties: false,
        properties: {
          x: { type: 'string' },
          y: { type: 'string' },
          z: { type: 'string' },
          intensity: { type: 'string' },
        },
      },
    },
    options: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'conditions', 'visibleObjs'],
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          conditions: {
            type: 'object',
            required: ['optionPackToggle', 'variant'],
            additionalProperties: false,
            properties: {
              optionPackToggle: { type: 'boolean' },
              variant: {
                oneOf: [
                  { type: 'string' },
                  { type: 'array', items: { type: 'string' } },
                ],
              },
            },
          },
          visibleObjs: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
    objectNames: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
  },
}

export const MARKER_SEVERITY_ERROR = 8 // monaco.MarkerSeverity.Error — stable across versions

// Referential check that a JSON Schema can't express: every options[].visibleObjs
// entry must be a key that actually exists in objectNames. Returns Monaco marker
// objects (1-based line/column) so they can be merged with schema diagnostics.
// Kept free of a `monaco` import so it doesn't force-load the editor bundle.
export function findReferentialErrors(text) {
  const root = parseTree(text)
  if (!root) return []

  const objectNamesNode = findNodeAtLocation(root, ['objectNames'])
  const knownAliases = new Set(
    objectNamesNode && objectNamesNode.type === 'object'
      ? objectNamesNode.children.map(prop => prop.children[0].value)
      : []
  )

  const optionsNode = findNodeAtLocation(root, ['options'])
  if (!optionsNode || optionsNode.type !== 'array') return []

  const markers = []
  optionsNode.children.forEach((optionNode, optIndex) => {
    const visibleObjsNode = findNodeAtLocation(optionNode, ['visibleObjs'])
    if (!visibleObjsNode || visibleObjsNode.type !== 'array') return

    const nameNode = findNodeAtLocation(optionNode, ['name'])
    const optionLabel = nameNode ? `"${getNodeValue(nameNode)}"` : `#${optIndex}`

    visibleObjsNode.children.forEach((itemNode, itemIndex) => {
      const alias = getNodeValue(itemNode)
      if (knownAliases.has(alias)) return

      const startPos = positionAt(text, itemNode.offset)
      const endPos = positionAt(text, itemNode.offset + itemNode.length)
      markers.push({
        severity: MARKER_SEVERITY_ERROR,
        message: `options[${optIndex}] (${optionLabel}).visibleObjs[${itemIndex}] references "${alias}", which has no matching entry in objectNames.`,
        startLineNumber: startPos.line,
        startColumn: startPos.column,
        endLineNumber: endPos.line,
        endColumn: endPos.column,
      })
    })
  })

  return markers
}

function positionAt(text, offset) {
  let line = 1
  let lastNewline = -1
  for (let i = 0; i < offset; i++) {
    if (text[i] === '\n') {
      line++
      lastNewline = i
    }
  }
  return { line, column: offset - lastNewline }
}

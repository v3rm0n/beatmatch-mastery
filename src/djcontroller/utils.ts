import type { XmlElement, XmlNode } from "@rgrove/parse-xml";

/**
 * A type predicate for checking whether the given node
 * is an XML element.
 */
export function isXmlElement(node: XmlNode): node is XmlElement {
	return node.type === "element";
}

/**
 * A convenience function for converting an array of
 * XML child nodes to an object.
 *
 * @param xml The array of children or node containing children.
 * @returns An object keyed by the name of the child elements
 */
export function xmlChildrenToObject(xml: { children: XmlNode[] } | XmlNode[]): {
	[name: string]: XmlElement;
} {
	const obj: { [name: string]: XmlElement } = {};
	const children = Array.isArray(xml) ? xml : xml.children;

	for (const child of children) {
		if (isXmlElement(child)) {
			obj[child.name] = child;
		}
	}

	return obj;
}

/**
 * Evaluates the given snippet of JS code and returns
 * variables and functions bound at the top level.
 *
 * @param args Values to provide that will be in scope during execution
 * @param jsSrc A piece of JS source code
 * @param returnVarName The variable name to return
 * @returns An object holding variables and functions bound at the top level
 */
export function evalScript(
	jsSrc: string,
	args: object = {},
	returnVarName?: string,
	localNames: string[] = [],
): object {
	const argNames = Object.keys(args);
	const locals = [...new Set(localNames)].filter(
		(name) => !argNames.includes(name) && /^[A-Za-z_$][\w$]*$/.test(name),
	);
	// An outer parameter captures legacy implicit namespace assignments. A block
	// lets newer scripts declare the same namespace with let or const as well.
	const script = new Function(
		...argNames,
		...locals,
		`{\n${jsSrc}; return ${returnVarName ?? "undefined"};\n}`,
	);
	return script(
		...argNames.map((a) => args[a]),
		...locals.map(() => undefined),
	);
}

/**
 * Fetches a nested value by key path.
 *
 * @param value The object to key into
 * @param keyPath The path into the object
 * @returns The value keyed by this path in `value`
 */
export function getByKeyPath<T = unknown>(
	value: object,
	...keyPath: string[]
): T {
	return keyPath.reduce((acc, key) => (acc ? acc[key] : undefined), value) as T;
}

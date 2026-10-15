import {
	mkdtemp,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseXml } from "@rgrove/parse-xml";

export async function generateManifest(directory) {
	const filenames = (await readdir(directory))
		.filter((name) => name.endsWith(".midi.xml"))
		.sort();
	const manifest = await Promise.all(
		filenames.map(async (filename) => {
			const root = parseXml(
				await readFile(path.join(directory, filename), "utf8"),
				{ ignoreUndefinedEntities: true },
			).root;
			const info = root.children.find(
				(child) => child.type === "element" && child.name === "info",
			);
			const name =
				info?.children.find(
					(child) => child.type === "element" && child.name === "name",
				)?.text || filename.slice(0, -9);
			const controller = root.children.find(
				(child) => child.type === "element" && child.name === "controller",
			);
			return { name, filename, id: controller?.attributes.id || name };
		}),
	);
	const temporary = await mkdtemp(path.join(directory, ".manifest-"));
	try {
		const filename = path.join(temporary, "manifest.json");
		await writeFile(filename, `${JSON.stringify(manifest, null, 2)}\n`);
		await rename(filename, path.join(directory, "manifest.json"));
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
	return manifest;
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const manifest = await generateManifest(
		process.argv[2] || "public/controllers",
	);
	console.log(`Generated manifest with ${manifest.length} controller mappings`);
}

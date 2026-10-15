// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { generateManifest } from "../etc/controller-manifest.mjs";

it("generates valid JSON with decoded XML entities, quotes, and multiline IDs", async () => {
	const directory = await mkdtemp(
		path.join(os.tmpdir(), "beatmatch-manifest-"),
	);
	try {
		await writeFile(
			path.join(directory, 'A "quoted".midi.xml'),
			'<MixxxControllerPreset><info><name>A &amp; &quot;B&quot;</name></info><controller\n id="abc"/></MixxxControllerPreset>',
		);
		await generateManifest(directory);
		expect(
			JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")),
		).toEqual([
			{ name: 'A & "B"', filename: 'A "quoted".midi.xml', id: "abc" },
		]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

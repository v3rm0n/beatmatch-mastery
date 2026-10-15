// @vitest-environment node
import { execFile } from "node:child_process";
import {
	access,
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);
it("recovers after a failed asset copy without publishing an incomplete controller directory", async () => {
	const fixture = await mkdtemp(path.join(os.tmpdir(), "beatmatch setup "));
	try {
		await mkdir(path.join(fixture, "etc"));
		await mkdir(path.join(fixture, "bin"));
		for (const file of ["mixxx_mappings.sh", "controller-manifest.mjs"])
			await copyFile(
				path.resolve("etc", file),
				path.join(fixture, "etc", file),
			);
		await symlink(
			path.resolve("node_modules"),
			path.join(fixture, "node_modules"),
			"dir",
		);
		await writeFile(
			path.join(fixture, "bin", "git"),
			`#!/bin/bash
if [ "$1" = "clone" ]; then
    fixture_target="\${@: -1}"
    mkdir -p "$fixture_target/res/controllers"
    echo '<MixxxControllerPreset><info><name>Fixture</name></info><controller id="fixture"/></MixxxControllerPreset>' > "$fixture_target/res/controllers/Fixture.midi.xml"
fi
`,
			{ mode: 0o755 },
		);
		await writeFile(
			path.join(fixture, "bin", "cp"),
			`#!/bin/bash
fixture_target="\${@: -1}"
echo incomplete > "$fixture_target/incomplete"
exit 1
`,
			{ mode: 0o755 },
		);
		const options = {
			cwd: fixture,
			env: {
				...process.env,
				PATH: `${path.join(fixture, "bin")}:${process.env.PATH}`,
			},
		};
		await expect(
			run("bash", ["etc/mixxx_mappings.sh"], options),
		).rejects.toThrow();
		await expect(
			access(path.join(fixture, "public", "controllers")),
		).rejects.toThrow();
		await rm(path.join(fixture, "bin", "cp"));
		await run("bash", ["etc/mixxx_mappings.sh"], options);
		expect(
			JSON.parse(
				await readFile(
					path.join(fixture, "public", "controllers", "manifest.json"),
					"utf8",
				),
			),
		).toEqual([
			{ name: "Fixture", filename: "Fixture.midi.xml", id: "fixture" },
		]);
		await run("bash", ["etc/mixxx_mappings.sh"], options);
	} finally {
		await rm(fixture, { recursive: true, force: true });
	}
});

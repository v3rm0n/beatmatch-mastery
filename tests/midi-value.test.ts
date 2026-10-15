import { expect, it } from "vitest";
import { relativeMidiValue } from "@/djcontroller/midi-value";

it.each([
	[1, 0, "selectknob", 1],
	[127, 0, "selectknob", -1],
	[63, 0, "spread64", -1],
	[64, 0, "spread64", 0],
	[65, 0, "spread64", 1],
	[127, 64, "diff", 63],
	[1, 64, "diff", 65],
	[65, 64, "rot64", 64.0625],
	[63, 64, "rot64inv", 64.0625],
	[64, 64, "rot64", 64],
	[65, 64, "rot64fast", 65.5],
	[127, 10, "hercjogfast", 7],
] as const)(
	"decodes %s from %s using %s",
	(raw, previous, option, expected) => {
		expect(relativeMidiValue(raw, previous, [option])).toBe(expected);
	},
);

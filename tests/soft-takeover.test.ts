import { expect, it } from "vitest";
import { SoftTakeover } from "@/djcontroller/soft-takeover";

it("blocks initial jumps until the hardware reaches or crosses the software value", () => {
	const takeover = new SoftTakeover();
	expect(takeover.ignore(0.1, 0.6, 0)).toBe(true);
	expect(takeover.ignore(0.2, 0.6, 100)).toBe(true);
	expect(takeover.ignore(0.7, 0.6, 200)).toBe(false);
});

it("allows continuous movement after pickup and protects a later software change", () => {
	const takeover = new SoftTakeover();
	takeover.ignore(0.5, 0.5, 0);
	expect(takeover.ignore(0.51, 0.5, 100)).toBe(false);
	expect(takeover.ignore(0.8, 0.51, 120)).toBe(false);
	expect(takeover.ignore(0.7, 0.1, 300)).toBe(true);
	expect(takeover.ignore(0.08, 0.1, 400)).toBe(false);
});

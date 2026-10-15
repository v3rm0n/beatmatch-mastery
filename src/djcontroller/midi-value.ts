/** Decode Mixxx's relative MIDI options in the controller's 0–127 units.
 * https://github.com/mixxxdj/mixxx/blob/main/src/controllers/midi/midicontroller.cpp
 */
export function relativeMidiValue(
	raw: number,
	previous: number,
	options: string[],
): number | undefined {
	const signed = raw >= 64 ? raw - 128 : raw;
	if (options.includes("selectknob")) return signed;
	if (options.includes("spread64")) return raw - 64;
	if (options.includes("diff")) return previous + signed;
	if (options.includes("hercjog") || options.includes("hercjogfast")) {
		return (
			previous +
			(raw > 64 ? raw - 128 : raw) * (options.includes("hercjogfast") ? 3 : 1)
		);
	}
	if (options.includes("rot64fast"))
		return Math.max(0, Math.min(127, previous + (raw - 64) * 1.5));
	if (options.includes("rot64") || options.includes("rot64inv")) {
		let change = raw - 64;
		if (Math.abs(change) === 1) change /= 16;
		else if (change !== 0) change -= Math.sign(change);
		return Math.max(
			0,
			Math.min(
				127,
				previous + change * (options.includes("rot64inv") ? -1 : 1),
			),
		);
	}
	return undefined;
}

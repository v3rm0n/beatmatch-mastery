/** Keep a hardware fader from jumping a software control until it catches up.
 * Timing and tolerance match Mixxx's SoftTakeover controller behavior.
 * https://github.com/mixxxdj/mixxx/blob/main/src/controllers/softtakeover.h
 */
export class SoftTakeover {
	private previous: number | undefined;
	private lastAccepted = Number.NEGATIVE_INFINITY;

	ignore(next: number, current: number, now = performance.now()): boolean {
		const previous = this.previous;
		this.previous = next;
		if (previous === undefined) return true;
		const distance = current - next;
		const previousDistance = current - previous;
		const crosses = Math.sign(distance) !== Math.sign(previousDistance);
		const near =
			Math.abs(distance) <= 3 / 128 || Math.abs(previousDistance) <= 3 / 128;
		if (now - this.lastAccepted < 50 || crosses || near) {
			this.lastAccepted = now;
			return false;
		}
		return true;
	}
}

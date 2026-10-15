import { useCallback, useEffect, useRef, useState } from "react";
import { Clap } from "@/components/audio/Clap";
import { Hat } from "@/components/audio/Hat";
import type { Instrument } from "@/components/audio/Instrument";
import { Kick } from "@/components/audio/Kick";
import { Snare } from "@/components/audio/Snare";

export type Beat = "kick" | "snare" | "hat" | "clap" | Beat[] | false;

export interface BeatPattern {
	id: string;
	name: string;
	pattern: Beat[]; // Array of 16 beats (4/4 time)
	description: string;
}

export const BEAT_PATTERNS: BeatPattern[] = [
	{
		id: "four-on-floor",
		name: "4 on the Floor",
		pattern: [
			"kick",
			false,
			false,
			false,
			"kick",
			false,
			false,
			false,
			"kick",
			false,
			false,
			false,
			"kick",
			false,
			false,
			false,
		],
		description: "Classic house/techno kick pattern",
	},
	{
		id: "four-on-floor-clap",
		name: "4 on the Floor with clap",
		pattern: [
			"kick",
			false,
			false,
			false,
			["kick", "clap"],
			false,
			false,
			false,
			"kick",
			false,
			false,
			false,
			["kick", "clap"],
			false,
			false,
			false,
		],
		description: "4 on the floor with claps",
	},
	{
		id: "dnb",
		name: "Drum & Bass",
		pattern: [
			"kick",
			false,
			false,
			false,
			`snare`,
			false,
			false,
			false,
			false,
			false,
			"kick",
			false,
			"snare",
			false,
			false,
			false,
		],
		description: "Standard DNB break pattern",
	},
	{
		id: "minimal",
		name: "Minimal",
		pattern: [
			"kick",
			false,
			false,
			false,
			false,
			false,
			false,
			false,
			"kick",
			false,
			false,
			false,
			false,
			false,
			false,
			false,
		],
		description: "Simple minimal pattern",
	},
];

export class AudioEngine {
	private audioContext: AudioContext;
	private nextNoteTime: number = 0;
	private scheduleAheadTime: number = 0.1; // 100ms scheduling
	private tempo: number = 120;
	private currentNote: number = 0;
	private pattern: Beat[] = [];
	private timerWorker: Worker;
	private output: GainNode;
	private playing = false;
	private disposed = false;
	private playbackVersion = 0;
	private scheduledBeats: { beat: number; time: number }[] = [];
	private audibleBeat = 0;
	private instruments: Record<"kick" | "snare" | "hat" | "clap", Instrument>;

	constructor() {
		this.audioContext =
			new //biome-ignore lint/suspicious/noExplicitAny: Need to check for webkitAudioContext
			(window.AudioContext || (window as any).webkitAudioContext)();

		this.createOutput();

		// Create timer worker for precise scheduling
		const workerBlob = new Blob(
			[
				`
      let timerID = null;

      self.onmessage = function(e) {
        if (e.data === "start" && !timerID) {
          timerID = setInterval(() => self.postMessage("tick"), 25);
        } else if (e.data === "stop") {
          clearInterval(timerID);
          timerID = null;
        }
      };
    `,
			],
			{ type: "application/javascript" },
		);

		const workerUrl = URL.createObjectURL(workerBlob);
		try {
			this.timerWorker = new Worker(workerUrl);
		} catch (error) {
			this.output.disconnect();
			void this.audioContext.close();
			throw error;
		} finally {
			URL.revokeObjectURL(workerUrl);
		}
		this.timerWorker.onmessage = () => {
			this.scheduler();
		};
	}

	private createOutput() {
		this.output = this.audioContext.createGain();
		this.output.connect(this.audioContext.destination);
		this.instruments = {
			kick: new Kick(this.audioContext, this.output),
			snare: new Snare(this.audioContext, this.output),
			hat: new Hat(this.audioContext, this.output),
			clap: new Clap(this.audioContext, this.output),
		};
	}

	setTempo(tempo: number) {
		if (!Number.isFinite(tempo) || tempo <= 0) return;
		this.tempo = tempo;
	}

	setPattern(pattern: Beat[]) {
		this.pattern = pattern;
	}

	setVolume(volume: number) {
		if (Number.isFinite(volume)) {
			this.output.gain.value = Math.max(0, Math.min(1, volume));
		}
	}

	private nextNote() {
		const secondsPerBeat = 60.0 / this.tempo;
		this.nextNoteTime += 0.25 * secondsPerBeat; // 16th note
		this.currentNote = (this.currentNote + 1) % this.pattern.length;
	}

	private scheduleBeat(beat: Beat, time: number) {
		if (Array.isArray(beat)) {
			for (const part of beat) this.scheduleBeat(part, time);
		} else if (typeof beat === "string") {
			this.instruments[beat]?.trigger(time);
		}
	}

	private scheduleNote(beatNumber: number, time: number) {
		this.scheduledBeats.push({ beat: beatNumber, time });
		const beat = this.pattern[beatNumber];
		if (Array.isArray(beat)) {
			beat.forEach((b) => this.scheduleBeat(b, time));
			return;
		}
		this.scheduleBeat(beat, time);
	}

	private scheduler() {
		if (!this.playing || this.disposed || !this.pattern.length) return;
		// Skip missed notes after a suspended/background tab instead of playing a burst.
		if (this.nextNoteTime < this.audioContext.currentTime) {
			const step = 15 / this.tempo;
			const missed = Math.ceil(
				(this.audioContext.currentTime - this.nextNoteTime) / step,
			);
			this.currentNote = (this.currentNote + missed) % this.pattern.length;
			this.nextNoteTime += missed * step;
		}
		this.getCurrentBeat();
		while (
			this.nextNoteTime <
			this.audioContext.currentTime + this.scheduleAheadTime
		) {
			this.scheduleNote(this.currentNote, this.nextNoteTime);
			this.nextNote();
		}
	}

	async prepare(): Promise<boolean> {
		if (this.disposed) return false;
		if (this.audioContext.state !== "running") await this.audioContext.resume();
		return !this.disposed && this.audioContext.state === "running";
	}

	async start(): Promise<boolean> {
		if (this.disposed || !this.pattern.length) return false;
		if (this.playing) this.stop();
		const version = ++this.playbackVersion;
		try {
			if (!(await this.prepare())) return false;
			if (this.disposed || version !== this.playbackVersion) return false;
			this.playing = true;
			this.currentNote = 0;
			this.scheduledBeats = [];
			this.nextNoteTime = this.audioContext.currentTime;
			this.scheduler();
			this.timerWorker.postMessage("start");
			return true;
		} catch (error) {
			this.stop();
			console.error("Failed to start audio engine:", error);
			return false;
		}
	}

	stop() {
		++this.playbackVersion;
		this.playing = false;
		this.timerWorker.postMessage("stop");
		this.scheduledBeats = [];
		this.audibleBeat = 0;
		// Disconnect queued notes and tails, including when immediately cueing again.
		const volume = this.output.gain.value;
		this.output.disconnect();
		if (!this.disposed) {
			this.createOutput();
			this.setVolume(volume);
		}
	}

	getCurrentBeat(): number {
		while (this.scheduledBeats[0]?.time <= this.audioContext.currentTime) {
			this.audibleBeat = this.scheduledBeats.shift().beat;
		}
		return this.audibleBeat;
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.stop();
		this.timerWorker.terminate();
		void this.audioContext.close();
	}
}

export const useAudioEngine = () => {
	const audioEngineRef = useRef<AudioEngine | null>(null);
	const playbackVersion = useRef(0);
	const [error, setError] = useState<string | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentBeat, setCurrentBeat] = useState(0);

	useEffect(() => {
		try {
			audioEngineRef.current = new AudioEngine();
		} catch {
			setError(
				"Audio is unavailable in this browser. Check your audio permissions or try another browser.",
			);
		}

		return () => {
			++playbackVersion.current;
			audioEngineRef.current?.dispose();
			audioEngineRef.current = null;
		};
	}, []);

	useEffect(() => {
		let animationFrameId: number;

		const updateBeat = () => {
			if (audioEngineRef.current) {
				setCurrentBeat(audioEngineRef.current.getCurrentBeat());
			}
			if (isPlaying) {
				animationFrameId = requestAnimationFrame(updateBeat);
			}
		};

		if (isPlaying) {
			updateBeat();
		}

		return () => {
			if (animationFrameId) {
				cancelAnimationFrame(animationFrameId);
			}
		};
	}, [isPlaying]);

	const prepare = useCallback(async () => {
		const engine = audioEngineRef.current;
		if (!engine) return false;
		try {
			const ready = await engine.prepare();
			if (audioEngineRef.current === engine)
				setError(
					ready
						? null
						: "Audio could not start. Check your browser's audio permissions and try again.",
				);
			return ready;
		} catch {
			if (audioEngineRef.current === engine)
				setError(
					"Audio could not start. Check your browser's audio permissions and try again.",
				);
			return false;
		}
	}, []);

	const start = useCallback(async () => {
		const engine = audioEngineRef.current;
		const version = ++playbackVersion.current;
		if (!engine) return;
		const playing = await engine.start();
		if (
			audioEngineRef.current !== engine ||
			version !== playbackVersion.current
		)
			return;
		setIsPlaying(playing);
		setError(
			playing
				? null
				: "Audio could not start. Check your browser's audio permissions and try again.",
		);
	}, []);

	const stop = useCallback(() => {
		++playbackVersion.current;
		if (audioEngineRef.current) {
			audioEngineRef.current.stop();
			setIsPlaying(false);
			setCurrentBeat(0);
		}
	}, []);

	return {
		error,
		prepare,
		isPlaying,
		currentBeat,
		start,
		stop,
		setTempo: useCallback(
			(tempo: number) => audioEngineRef.current?.setTempo(tempo),
			[],
		),
		setPattern: useCallback(
			(pattern: Beat[]) => audioEngineRef.current?.setPattern(pattern),
			[],
		),
		setVolume: useCallback(
			(volume: number) => audioEngineRef.current?.setVolume(volume),
			[],
		),
	};
};

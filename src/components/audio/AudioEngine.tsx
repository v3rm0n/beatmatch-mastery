import { useEffect, useRef, useState } from "react";
import { Hat } from "@/components/audio/Hat";
import { Kick } from "@/components/audio/Kick";
import { Snare } from "@/components/audio/Snare";
import { Clap } from "@/components/audio/Clap";

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
	private timerWorker: Worker | null = null;
	private noteQueue: Array<{ note: number; time: number }> = [];
	private kick: Kick;
	private snare: Snare;
	private hat: Hat;
	private clap: Clap;

	constructor() {
		this.audioContext =
			new //biome-ignore lint/suspicious/noExplicitAny: Need to check for webkitAudioContext
			(window.AudioContext || (window as any).webkitAudioContext)();

		this.kick = new Kick(this.audioContext);
		this.snare = new Snare(this.audioContext);
		this.hat = new Hat(this.audioContext);
		this.clap = new Clap(this.audioContext);

		// Create timer worker for precise scheduling
		const workerBlob = new Blob(
			[
				`
      let timerID = null;
      let interval = 100;

      self.onmessage = function(e) {
        if (e.data === "start" && !timerID) {
          timerID = setInterval(() => self.postMessage("tick"), interval);
        } else if (e.data === "stop") {
          clearInterval(timerID);
          timerID = null;
        } else if (e.data.interval) {
          interval = e.data.interval;
          if (timerID) {
            clearInterval(timerID);
            timerID = setInterval(() => self.postMessage("tick"), interval);
          }
        }
      };
    `,
			],
			{ type: "application/javascript" },
		);

		this.timerWorker = new Worker(URL.createObjectURL(workerBlob));
		this.timerWorker.onmessage = () => {
			this.scheduler();
		};
	}

	setTempo(tempo: number) {
		this.tempo = tempo;
	}

	setPattern(pattern: Beat[]) {
		this.pattern = pattern;
	}

	setVolume(volume: number) {
		this.kick.setVolume(volume);
		this.snare.setVolume(volume);
		this.hat.setVolume(volume);
		this.clap.setVolume(volume);
	}

	private nextNote() {
		const secondsPerBeat = 60.0 / this.tempo;
		this.nextNoteTime += 0.25 * secondsPerBeat; // 16th note
		this.currentNote = (this.currentNote + 1) % this.pattern.length;
	}

	private scheduleBeat(beat: Beat, time: number) {
		if (beat === "kick") {
			this.kick.trigger(time);
		} else if (beat === "snare") {
			this.snare.trigger(time);
		} else if (beat === "hat") {
			this.hat.trigger(time);
		} else if (beat === "clap") {
			this.clap.trigger(time);
		}
	}

	private scheduleNote(beatNumber: number, time: number) {
		this.noteQueue.push({ note: beatNumber, time: time });

		const beat = this.pattern[beatNumber];
		if (Array.isArray(beat)) {
			beat.forEach((b) => this.scheduleBeat(b, time));
			return;
		}
		this.scheduleBeat(beat, time);
	}

	private scheduler() {
		while (
			this.nextNoteTime <
			this.audioContext.currentTime + this.scheduleAheadTime
		) {
			this.scheduleNote(this.currentNote, this.nextNoteTime);
			this.nextNote();
		}
	}

	async start() {
		try {
			if (this.audioContext.state === "suspended") {
				await this.audioContext.resume();
			}

			// Ensure we have a pattern set
			if (!this.pattern.length) {
				console.warn("No pattern set for audio engine");
				return;
			}

			this.currentNote = 0;
			this.nextNoteTime = this.audioContext.currentTime;
			this.timerWorker?.postMessage("start");

			console.log("Audio engine started, pattern length:", this.pattern.length);
		} catch (error) {
			console.error("Failed to start audio engine:", error);
		}
	}

	stop() {
		this.timerWorker?.postMessage("stop");
		this.noteQueue = [];
	}

	getCurrentBeat(): number {
		return this.currentNote;
	}

	getNoteQueue() {
		return this.noteQueue;
	}

	dispose() {
		this.stop();
		this.timerWorker?.terminate();
		this.audioContext.close();
	}
}

interface AudioEngineHookReturn {
	audioEngine: AudioEngine | null;
	isPlaying: boolean;
	currentBeat: number;
	start: () => void;
	stop: () => void;
	setTempo: (tempo: number) => void;
	setPattern: (pattern: Beat[]) => void;
	setVolume: (volume: number) => void;
}

export const useAudioEngine = (): AudioEngineHookReturn => {
	const audioEngineRef = useRef<AudioEngine | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentBeat, setCurrentBeat] = useState(0);

	useEffect(() => {
		audioEngineRef.current = new AudioEngine();

		return () => {
			audioEngineRef.current?.dispose();
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

	const start = async () => {
		if (audioEngineRef.current) {
			await audioEngineRef.current.start();
			setIsPlaying(true);
		}
	};

	const stop = () => {
		if (audioEngineRef.current) {
			audioEngineRef.current.stop();
			setIsPlaying(false);
		}
	};

	const setTempo = (tempo: number) => {
		audioEngineRef.current?.setTempo(tempo);
	};

	const setPattern = (pattern: Beat[]) => {
		audioEngineRef.current?.setPattern(pattern);
	};

	const setVolume = (volume: number) => {
		audioEngineRef.current?.setVolume(volume);
	};

	return {
		audioEngine: audioEngineRef.current,
		isPlaying,
		currentBeat,
		start,
		stop,
		setTempo,
		setPattern,
		setVolume,
	};
};

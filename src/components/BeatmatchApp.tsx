import { Music, RotateCcw, Target, Trophy } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
	BEAT_PATTERNS,
	type BeatPattern,
	useAudioEngine,
} from "@/components/audio/AudioEngine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Deck } from "./Deck";
import { MidiController } from "./MidiController";

interface _DeckState {
	tempo: number;
	tempoOffset: number;
	jogWheelVelocity: number;
	volume: number;
}

interface GameState {
	phase: "setup" | "playing" | "finished";
	selectedPattern: BeatPattern | null;
	deckATempo: number;
	deckATempoOffset: number;
	deckAJogWheelOffset: number;
	deckBTempo: number;
	deckBTempoOffset: number;
	deckBJogWheelOffset: number;
	deckAVolume: number;
	deckBVolume: number;
	crossfaderPosition: number;
	score: number | null;
	startTime: number | null;
	sessionDuration: number;
}

export const BeatmatchApp: React.FC = () => {
	const { toast } = useToast();

	const jogWheelTimeoutA = useRef<NodeJS.Timeout | null>(null);
	const jogWheelTimeoutB = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		return () => {
			if (jogWheelTimeoutA.current) {
				clearTimeout(jogWheelTimeoutA.current);
			}
			if (jogWheelTimeoutB.current) {
				clearTimeout(jogWheelTimeoutB.current);
			}
		};
	}, []);

	const decks = {
		A: useAudioEngine(),
		B: useAudioEngine(),
	};

	const maxBpmVariation = 6;

	const initialState: GameState = {
		phase: "setup",
		selectedPattern: null,
		deckATempo: 120,
		deckATempoOffset: 0,
		deckAJogWheelOffset: 0,
		deckBTempo: 120,
		deckBTempoOffset: 0,
		deckBJogWheelOffset: 0,
		deckAVolume: 1.0,
		deckBVolume: 1.0,
		crossfaderPosition: 0.5,
		score: null,
		startTime: null,
		sessionDuration: 0,
	};

	const [gameState, setGameState] = useState<GameState>({
		...initialState,
	});

	useEffect(() => {
		const totalTempo =
			gameState.deckATempo +
			gameState.deckATempoOffset +
			gameState.deckAJogWheelOffset;
		decks.A.setTempo(totalTempo);
	}, [
		decks.A,
		gameState.deckATempo,
		gameState.deckATempoOffset,
		gameState.deckAJogWheelOffset,
	]);

	useEffect(() => {
		const totalTempo =
			gameState.deckBTempo +
			gameState.deckBTempoOffset +
			gameState.deckBJogWheelOffset;
		decks.B.setTempo(totalTempo);
	}, [
		decks.B,
		gameState.deckBTempo,
		gameState.deckBTempoOffset,
		gameState.deckBJogWheelOffset,
	]);

	const generateRandomTempo = (baseTempo: number): number => {
		const min = Math.max(80, baseTempo - maxBpmVariation);
		const max = Math.min(180, baseTempo + maxBpmVariation);
		return Math.round((Math.random() * (max - min) + min) * 10) / 10;
	};

	const startSession = () => {
		if (!gameState.selectedPattern) {
			toast({
				title: "Select a beat pattern",
				description: "Please choose a beat pattern before starting.",
				variant: "destructive",
			});
			return;
		}

		const randomTempo = generateRandomTempo(gameState.deckATempo);

		setGameState((prev) => ({
			...prev,
			phase: "playing",
			deckBTempo: randomTempo,
			startTime: Date.now(),
			score: null,
		}));

		// Set up audio engines
		decks.A.setTempo(gameState.deckATempo);
		decks.A.setPattern(gameState.selectedPattern.pattern);
		decks.A.setVolume(gameState.deckAVolume);

		decks.B.setTempo(gameState.deckBTempo);
		decks.B.setPattern(gameState.selectedPattern.pattern);
		decks.B.setVolume(gameState.deckBVolume);

		toast({
			title: "Session started!",
			description:
				"Try to match the tempo of both decks by ear. Deck B's tempo is hidden.",
		});
	};

	const finishSession = () => {
		decks.A.stop();
		decks.B.stop();

		const tempoDifference = Math.abs(
			gameState.deckBTempo +
				gameState.deckBTempoOffset -
				(gameState.deckATempo + gameState.deckATempoOffset),
		);
		const accuracy = Math.max(0, 100 - tempoDifference * 2); // 2% penalty per BPM difference
		const duration = gameState.startTime
			? (Date.now() - gameState.startTime) / 1000
			: 0;

		setGameState((prev) => ({
			...prev,
			phase: "finished",
			score: Math.round(accuracy),
			sessionDuration: duration,
		}));

		toast({
			title: "Session completed!",
			description: `Your accuracy: ${Math.round(accuracy)}%`,
		});
	};

	const resetSession = () => {
		decks.A.stop();
		decks.B.stop();
		setGameState({
			...initialState,
		});
	};

	// Crossfader logic: applies crossfader curve to individual deck volumes
	const applyCrossfader = (
		deckAVolume: number,
		deckBVolume: number,
		position: number,
	) => {
		// Crossfader curve: 0.0 = full left (deck A), 0.5 = center, 1.0 = full right (deck B)
		const leftCurve = position <= 0.5 ? 1.0 : 2.0 * (1.0 - position);
		const rightCurve = position >= 0.5 ? 1.0 : 2.0 * position;

		// Apply crossfader curve to the current individual deck volumes
		const finalDeckAVolume = deckAVolume * leftCurve;
		const finalDeckBVolume = deckBVolume * rightCurve;

		// Update the actual audio engine volumes
		decks.A.setVolume(finalDeckAVolume);
		decks.B.setVolume(finalDeckBVolume);
	};

	const handleCrossfaderChange = (position: number) => {
		setGameState((prev) => ({ ...prev, crossfaderPosition: position }));
		applyCrossfader(gameState.deckAVolume, gameState.deckBVolume, position);
	};

	// Apply crossfader whenever individual deck volumes
	//biome-ignore lint/correctness/useExhaustiveDependencies: Includes everything that applyCrossfader depends on
	useEffect(() => {
		applyCrossfader(
			gameState.deckAVolume,
			gameState.deckBVolume,
			gameState.crossfaderPosition,
		);
	}, [
		gameState.deckAVolume,
		gameState.deckBVolume,
		gameState.crossfaderPosition,
	]);

	return (
		<div className="min-h-screen bg-background p-4">
			<div className="max-w-7xl mx-auto space-y-6">
				<div className="text-center space-y-2">
					<h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
						Beatmatch Trainer
					</h1>
					<p className="text-muted-foreground">
						Practice beatmatching with your MIDI controller
					</p>
				</div>

				{/* Game Status */}
				<Card className="p-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-4">
							<Badge
								variant={
									gameState.phase === "setup"
										? "secondary"
										: gameState.phase === "playing"
											? "default"
											: "outline"
								}
							>
								{gameState.phase === "setup"
									? "Setup"
									: gameState.phase === "playing"
										? "Playing"
										: "Finished"}
							</Badge>

							{gameState.selectedPattern && (
								<div className="flex items-center gap-2">
									<Music className="w-4 h-4" />
									<span className="text-sm">
										{gameState.selectedPattern.name}
									</span>
								</div>
							)}
						</div>

						<div className="flex items-center gap-4">
							{gameState.phase === "setup" && (
								<Button onClick={startSession} className="bg-gradient-primary">
									<Target className="w-4 h-4 mr-2" />
									Start Session
								</Button>
							)}

							{gameState.phase === "playing" && (
								<Button onClick={finishSession} variant="outline">
									<Trophy className="w-4 h-4 mr-2" />
									Finish & Score
								</Button>
							)}

							{gameState.phase === "finished" && (
								<Button onClick={resetSession} variant="outline">
									<RotateCcw className="w-4 h-4 mr-2" />
									New Session
								</Button>
							)}
						</div>
					</div>
				</Card>

				{/* Setup Controls */}
				{gameState.phase === "setup" && (
					<Card className="p-4">
						<div className="space-y-4">
							<h3 className="font-semibold">Session Setup</h3>

							<div className="grid md:grid-cols-2 gap-4">
								<div className="space-y-2">
									<label className="text-sm font-medium">Beat Pattern</label>
									<Select
										onValueChange={(patternId) => {
											const pattern = BEAT_PATTERNS.find(
												(p) => p.id === patternId,
											);
											setGameState((prev) => ({
												...prev,
												selectedPattern: pattern || null,
											}));
										}}
									>
										<SelectTrigger>
											<SelectValue placeholder="Choose a beat pattern" />
										</SelectTrigger>
										<SelectContent>
											{BEAT_PATTERNS.map((pattern) => (
												<SelectItem key={pattern.id} value={pattern.id}>
													<div>
														<div className="font-medium">{pattern.name}</div>
														<div className="text-xs text-muted-foreground">
															{pattern.description}
														</div>
													</div>
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-2">
									<label className="text-sm font-medium">
										Base Tempo (BPM)
									</label>
									<Select
										onValueChange={(tempo) => {
											setGameState((prev) => ({
												...prev,
												deckATempo: parseInt(tempo),
											}));
										}}
									>
										<SelectTrigger>
											<SelectValue placeholder="120" />
										</SelectTrigger>
										<SelectContent>
											{[100, 110, 120, 128, 140, 150, 160, 170].map((bpm) => (
												<SelectItem key={bpm} value={bpm.toString()}>
													{bpm} BPM
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
						</div>
					</Card>
				)}

				{/* Results */}
				{gameState.phase === "finished" && gameState.score !== null && (
					<Card className="p-6 bg-gradient-deck">
						<div className="text-center space-y-4">
							<h3 className="text-2xl font-bold">Session Results</h3>

							<div className="grid md:grid-cols-3 gap-4">
								<div className="text-center">
									<div className="text-3xl font-bold text-primary">
										{gameState.score}%
									</div>
									<div className="text-sm text-muted-foreground">Accuracy</div>
								</div>

								<div className="text-center">
									<div className="text-lg font-mono">
										{(
											gameState.deckATempo +
											gameState.deckATempoOffset +
											-gameState.deckBTempoOffset
										).toFixed(1)}{" "}
										BPM
									</div>
									<div className="text-sm text-muted-foreground">
										Your guess
									</div>
								</div>

								<div className="text-center">
									<div className="text-lg font-mono text-accent">
										{gameState.deckBTempo.toFixed(1)} BPM
									</div>
									<div className="text-sm text-muted-foreground">
										Actual tempo
									</div>
								</div>
							</div>

							<div className="text-sm text-muted-foreground">
								Difference:{" "}
								{Math.abs(
									gameState.deckBTempo +
										gameState.deckBTempoOffset -
										(gameState.deckATempo + gameState.deckATempoOffset),
								).toFixed(1)}{" "}
								BPM
							</div>
						</div>
					</Card>
				)}

				{/* MIDI Controller */}
				<MidiController
					gameStarted={gameState.phase !== "setup"}
					onPlay={(deckId) => {
						decks[deckId].start();
					}}
					onStop={(deckId) => {
						decks[deckId].stop();
					}}
					onCue={(deckId) => {
						decks[deckId].start();
					}}
					onJogWheel={(deckId, offset) => {
						if (deckId === "A" && jogWheelTimeoutA.current) {
							clearTimeout(jogWheelTimeoutA.current);
						}
						if (deckId === "B" && jogWheelTimeoutB.current) {
							clearTimeout(jogWheelTimeoutB.current);
						}
						if (deckId === "A") {
							setGameState((prev) => ({
								...prev,
								deckAJogWheelOffset: offset,
							}));
						}
						if (deckId === "B") {
							setGameState((prev) => ({
								...prev,
								deckBJogWheelOffset: offset,
							}));
						}

						const resetJogWheel = () => {
							if (deckId === "A") {
								setGameState((prev) => ({ ...prev, deckAJogWheelOffset: 0 }));
							}
							if (deckId === "B") {
								setGameState((prev) => ({ ...prev, deckBJogWheelOffset: 0 }));
							}
						};

						const timeoutId = setTimeout(resetJogWheel, 60);

						if (deckId === "A") {
							jogWheelTimeoutA.current = timeoutId;
						}
						if (deckId === "B") {
							jogWheelTimeoutB.current = timeoutId;
						}
					}}
					onCrossfaderChange={handleCrossfaderChange}
					onRateChange={(deckId, rate) => {
						const offset = Math.round(-rate * maxBpmVariation * 10) / 10;
						if (deckId === "A") {
							setGameState((prev) => ({ ...prev, deckATempoOffset: offset }));
						}
						if (deckId === "B") {
							setGameState((prev) => ({ ...prev, deckBTempoOffset: offset }));
						}
					}}
					onVolumeChange={(deckId, volume) => {
						if (deckId === "A") {
							setGameState((prev) => ({ ...prev, deckAVolume: volume }));
						}
						if (deckId === "B") {
							setGameState((prev) => ({ ...prev, deckBVolume: volume }));
						}
					}}
					isPlaying={(deckId) => decks[deckId].isPlaying}
				/>

				{/* DJ Decks */}
				{gameState.selectedPattern && gameState.phase !== "setup" && (
					<div className="grid lg:grid-cols-2 gap-6">
						<Deck
							deckId="A"
							maxBpmVariation={maxBpmVariation}
							isPlaying={decks.A.isPlaying}
							tempo={gameState.deckATempo}
							tempoOffset={gameState.deckATempoOffset}
							volume={gameState.deckAVolume}
							currentBeat={decks.A.currentBeat}
							pattern={gameState.selectedPattern.pattern}
							patternName={gameState.selectedPattern.name}
							onPlay={decks.A.start}
							onStop={decks.A.stop}
							onTempoOffsetChange={(offset) => {
								setGameState((prev) => ({ ...prev, deckATempoOffset: offset }));
							}}
							onVolumeChange={(volume) => {
								setGameState((prev) => ({ ...prev, deckAVolume: volume }));
							}}
						/>

						<Deck
							deckId="B"
							maxBpmVariation={maxBpmVariation}
							isPlaying={decks.B.isPlaying}
							tempo={gameState.deckBTempo}
							tempoOffset={gameState.deckBTempoOffset}
							volume={gameState.deckBVolume}
							currentBeat={decks.B.currentBeat}
							pattern={gameState.selectedPattern.pattern}
							patternName={gameState.selectedPattern.name}
							isHidden={gameState.phase === "playing"}
							onPlay={decks.B.start}
							onStop={decks.B.stop}
							onTempoOffsetChange={(offset) => {
								setGameState((prev) => ({ ...prev, deckBTempoOffset: offset }));
							}}
							onVolumeChange={(volume) => {
								setGameState((prev) => ({ ...prev, deckBVolume: volume }));
							}}
						/>
					</div>
				)}
			</div>
		</div>
	);
};

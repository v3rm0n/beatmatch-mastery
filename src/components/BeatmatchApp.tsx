import { Clock, Music, RotateCcw, Target, Trophy } from "lucide-react";
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
import { DECK_IDS, type DeckId } from "@/types/deck";
import { Deck } from "./Deck";
import { Footer } from "./Footer";
import { MidiController } from "./MidiController";
import { Input } from "./ui/input";

interface DeckState {
	tempo: number;
	tempoOffset: number;
	jogWheelOffset: number;
	volume: number;
}

interface GameState {
	phase: "setup" | "playing" | "finished";
	selectedPattern: BeatPattern;
	decks: Record<DeckId, DeckState>;
	crossfaderPosition: number;
	score: number | null;
	startTime: number | null;
	sessionDuration: number;
	maxBpmVariation: number;
}

const INITIAL_STATE: GameState = {
	phase: "setup",
	selectedPattern: BEAT_PATTERNS[0],
	decks: {
		A: { tempo: 120, tempoOffset: 0, jogWheelOffset: 0, volume: 1 },
		B: { tempo: 120, tempoOffset: 0, jogWheelOffset: 0, volume: 1 },
	},
	crossfaderPosition: 0.5,
	score: null,
	startTime: null,
	sessionDuration: 0,
	maxBpmVariation: 6,
};

const generateRandomTempo = (baseTempo: number, maxBpmVariation: number) => {
	const min = Math.max(80, baseTempo - maxBpmVariation);
	const max = Math.min(180, baseTempo + maxBpmVariation);
	return Math.round((Math.random() * (max - min) + min) * 10) / 10;
};

export const BeatmatchApp: React.FC = () => {
	const { toast } = useToast();
	const jogWheelTimeouts = useRef<
		Record<DeckId, ReturnType<typeof setTimeout> | null>
	>({ A: null, B: null });

	useEffect(() => {
		return () => {
			for (const deckId of DECK_IDS) {
				clearTimeout(jogWheelTimeouts.current[deckId]);
			}
		};
	}, []);

	const decks = {
		A: useAudioEngine(),
		B: useAudioEngine(),
	};

	const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
	const { A: deckA, B: deckB } = gameState.decks;
	const tempoDifference = Math.abs(
		deckB.tempo + deckB.tempoOffset - (deckA.tempo + deckA.tempoOffset),
	);

	const updateDeck = (deckId: DeckId, changes: Partial<DeckState>) => {
		setGameState((prev) => ({
			...prev,
			decks: {
				...prev.decks,
				[deckId]: { ...prev.decks[deckId], ...changes },
			},
		}));
	};

	useEffect(() => {
		decks.A.setTempo(deckA.tempo + deckA.tempoOffset + deckA.jogWheelOffset);
		decks.B.setTempo(deckB.tempo + deckB.tempoOffset + deckB.jogWheelOffset);
	}, [decks.A, decks.B, deckA, deckB]);

	const startSession = () => {
		if (!gameState.selectedPattern) {
			toast({
				title: "Select a beat pattern",
				description: "Please choose a beat pattern before starting.",
				variant: "destructive",
			});
			return;
		}

		if (deckA.tempo < 60 || deckA.tempo > 200) {
			toast({
				title: "Invalid tempo",
				description: "Base tempo must be between 60 and 200 BPM.",
				variant: "destructive",
			});
			return;
		}

		const randomTempo = generateRandomTempo(
			deckA.tempo,
			gameState.maxBpmVariation,
		);

		setGameState((prev) => ({
			...prev,
			phase: "playing",
			decks: {
				...prev.decks,
				B: { ...prev.decks.B, tempo: randomTempo },
			},
			startTime: Date.now(),
			score: null,
		}));

		for (const deckId of DECK_IDS) {
			decks[deckId].setTempo(gameState.decks[deckId].tempo);
			decks[deckId].setPattern(gameState.selectedPattern.pattern);
			decks[deckId].setVolume(gameState.decks[deckId].volume);
		}

		toast({
			title: "Session started!",
			description:
				"Try to match the tempo of both decks by ear. Deck B's tempo is hidden.",
		});
	};

	const finishSession = () => {
		decks.A.stop();
		decks.B.stop();

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
		setGameState(INITIAL_STATE);
	};

	const applyCrossfader = (
		deckAVolume: number,
		deckBVolume: number,
		position: number,
	) => {
		// Both decks retain full volume at the center of the crossfader.
		decks.A.setVolume(deckAVolume * (position <= 0.5 ? 1 : 2 * (1 - position)));
		decks.B.setVolume(deckBVolume * (position >= 0.5 ? 1 : 2 * position));
	};

	const handleCrossfaderChange = (position: number) => {
		setGameState((prev) => ({ ...prev, crossfaderPosition: position }));
		applyCrossfader(deckA.volume, deckB.volume, position);
	};

	//biome-ignore lint/correctness/useExhaustiveDependencies: Includes everything that applyCrossfader depends on
	useEffect(() => {
		applyCrossfader(deckA.volume, deckB.volume, gameState.crossfaderPosition);
	}, [deckA.volume, deckB.volume, gameState.crossfaderPosition]);

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
					<div className="flex items-center justify-between gap-2">
						<div className="flex items-center gap-1 sm:gap-4 min-w-0 flex-1">
							<Badge
								variant={
									gameState.phase === "setup"
										? "secondary"
										: gameState.phase === "playing"
											? "default"
											: "outline"
								}
								className="shrink-0"
							>
								{gameState.phase === "setup"
									? "Setup"
									: gameState.phase === "playing"
										? "Playing"
										: "Finished"}
							</Badge>

							{gameState.selectedPattern && (
								<div className="flex items-center gap-1 min-w-0 sm:flex">
									<Music className="w-4 h-4 shrink-0" />
									<span className="text-sm truncate">
										{gameState.selectedPattern.name}
									</span>
								</div>
							)}

							<div className="flex items-center gap-1 shrink-0">
								<Clock className="w-4 h-4" />
								<span className="text-xs sm:text-sm whitespace-nowrap">{`${deckA.tempo}±${gameState.maxBpmVariation}`}</span>
								<span className="text-xs sm:text-sm hidden sm:inline">BPM</span>
							</div>
						</div>

						<div className="flex items-center shrink-0">
							{gameState.phase === "setup" && (
								<Button
									onClick={startSession}
									className="bg-gradient-primary text-sm sm:text-base px-3 sm:px-4"
									size="sm"
								>
									<Target className="w-4 h-4 sm:mr-2" />
									<span className="hidden sm:inline">Start Session</span>
									<span className="sm:hidden">Start</span>
								</Button>
							)}

							{gameState.phase === "playing" && (
								<Button
									onClick={finishSession}
									variant="outline"
									className="text-sm sm:text-base px-3 sm:px-4"
									size="sm"
								>
									<Trophy className="w-4 h-4 sm:mr-2" />
									<span className="hidden sm:inline">Finish & Score</span>
									<span className="sm:hidden">Finish</span>
								</Button>
							)}

							{gameState.phase === "finished" && (
								<Button
									onClick={resetSession}
									variant="outline"
									className="text-sm sm:text-base px-3 sm:px-4"
									size="sm"
								>
									<RotateCcw className="w-4 h-4 sm:mr-2" />
									<span className="hidden sm:inline">New Session</span>
									<span className="sm:hidden">Reset</span>
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

							<div className="grid md:grid-cols-3 gap-4">
								<div className="space-y-2">
									<label className="text-sm font-medium">Beat Pattern</label>
									<Select
										value={gameState.selectedPattern.id}
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
										<SelectTrigger className="[&>span]:line-clamp-none min-h-[2.5rem] h-auto items-start py-2 text-left [&>span]:text-left">
											<SelectValue>
												{gameState.selectedPattern?.name}
											</SelectValue>
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
									<label className="text-sm font-medium">Base Tempo</label>
									<div className="relative">
										<Input
											type="number"
											min="60"
											max="200"
											step="0.1"
											value={deckA.tempo === 0 ? "" : deckA.tempo}
											onChange={(e) => {
												const value = e.target.value;
												if (value === "") {
													updateDeck("A", { tempo: 0 });
													return;
												}
												const tempo = parseFloat(value);
												if (!Number.isNaN(tempo)) {
													updateDeck("A", { tempo });
												}
											}}
											onBlur={(e) => {
												const tempo = parseFloat(e.target.value);
												if (
													Number.isNaN(tempo) ||
													tempo < 60 ||
													tempo > 200 ||
													e.target.value === ""
												) {
													updateDeck("A", { tempo: 120 });
												}
											}}
											placeholder="120"
											className="w-full pr-12"
										/>
										<div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
											<span className="text-sm text-muted-foreground">BPM</span>
										</div>
									</div>
								</div>

								<div className="space-y-2">
									<label className="text-sm font-medium">
										Max tempo variation
									</label>
									<div className="relative">
										<Select
											onValueChange={(maxBpmVariation) => {
												setGameState((prev) => ({
													...prev,
													maxBpmVariation: parseInt(maxBpmVariation),
												}));
											}}
										>
											<SelectTrigger className="pr-12">
												<SelectValue
													placeholder={`\u00B1 ${gameState.maxBpmVariation}`}
												/>
											</SelectTrigger>
											<SelectContent>
												{[
													6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
													20,
												].map((bpm) => (
													<SelectItem key={bpm} value={bpm.toString()}>
														{`\u00B1 ${bpm}`}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
											<span className="text-sm text-muted-foreground">BPM</span>
										</div>
									</div>
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
											deckA.tempo +
											deckA.tempoOffset -
											deckB.tempoOffset
										).toFixed(1)}{" "}
										BPM
									</div>
									<div className="text-sm text-muted-foreground">
										Your guess
									</div>
								</div>

								<div className="text-center">
									<div className="text-lg font-mono text-accent">
										{deckB.tempo.toFixed(1)} BPM
									</div>
									<div className="text-sm text-muted-foreground">
										Actual tempo
									</div>
								</div>
							</div>

							<div className="text-sm text-muted-foreground">
								Difference: {tempoDifference.toFixed(1)} BPM
							</div>
						</div>
					</Card>
				)}

				{/* MIDI Controller */}
				<MidiController
					gameStarted={gameState.phase !== "setup"}
					onPlay={(deckId) => decks[deckId].start()}
					onStop={(deckId) => decks[deckId].stop()}
					onCue={(deckId) => decks[deckId].start()}
					onJogWheel={(deckId, offset) => {
						clearTimeout(jogWheelTimeouts.current[deckId]);
						updateDeck(deckId, { jogWheelOffset: offset });
						jogWheelTimeouts.current[deckId] = setTimeout(() => {
							updateDeck(deckId, { jogWheelOffset: 0 });
						}, 60);
					}}
					onCrossfaderChange={handleCrossfaderChange}
					onRateChange={(deckId, rate) => {
						const tempoOffset =
							Math.round(-rate * gameState.maxBpmVariation * 10) / 10;
						updateDeck(deckId, { tempoOffset });
					}}
					onVolumeChange={(deckId, volume) => updateDeck(deckId, { volume })}
					isPlaying={(deckId) => decks[deckId].isPlaying}
				/>

				{/* DJ Decks */}
				{gameState.selectedPattern && gameState.phase !== "setup" && (
					<div className="grid lg:grid-cols-2 gap-6">
						{DECK_IDS.map((deckId) => (
							<Deck
								key={deckId}
								deckId={deckId}
								maxBpmVariation={gameState.maxBpmVariation}
								isPlaying={decks[deckId].isPlaying}
								jogOffset={gameState.decks[deckId].jogWheelOffset}
								tempo={gameState.decks[deckId].tempo}
								tempoOffset={gameState.decks[deckId].tempoOffset}
								volume={gameState.decks[deckId].volume}
								currentBeat={decks[deckId].currentBeat}
								pattern={gameState.selectedPattern.pattern}
								patternName={gameState.selectedPattern.name}
								isHidden={deckId === "B" && gameState.phase === "playing"}
								onPlay={decks[deckId].start}
								onCue={decks[deckId].start}
								onStop={decks[deckId].stop}
								onTempoOffsetChange={(tempoOffset) =>
									updateDeck(deckId, { tempoOffset })
								}
								onVolumeChange={(volume) => updateDeck(deckId, { volume })}
							/>
						))}
					</div>
				)}

				<Footer />
			</div>
		</div>
	);
};

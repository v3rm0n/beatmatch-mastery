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

interface GameState {
  phase: "setup" | "playing" | "finished";
  selectedPattern: BeatPattern | null;
  deckATempo: number;
  deckATempoOffset: number;
  deckAJogWheelVelocity: number;
  deckBTempo: number;
  deckBTempoOffset: number;
  deckBJogWheelVelocity: number;
  deckAVolume: number;
  deckBVolume: number;
  crossfaderPosition: number;
  score: number | null;
  startTime: number | null;
  sessionDuration: number;
}

export const BeatmatchApp: React.FC = () => {
  const { toast } = useToast();

  const deckA = useAudioEngine();
  const deckB = useAudioEngine();

  const jogWheelStateA = useRef({
    velocity: 0,
    lastInputTime: 0,
    animationFrameId: 0,
  });

  const jogWheelStateB = useRef({
    velocity: 0,
    lastInputTime: 0,
    animationFrameId: 0,
  });

  useEffect(() => {
    return () => {
      // Cleanup animation frames
      if (jogWheelStateA.current.animationFrameId) {
        cancelAnimationFrame(jogWheelStateA.current.animationFrameId);
      }
      if (jogWheelStateB.current.animationFrameId) {
        cancelAnimationFrame(jogWheelStateB.current.animationFrameId);
      }
    };
  }, []);

  const updateDeckTempo = (deck: "A" | "B") => {
    const jogWheelState =
      deck === "A" ? jogWheelStateA.current : jogWheelStateB.current;
    const jogWheelPitchBend = jogWheelState.velocity * 8; // Same scaling as in the decay animation

    if (deck === "A") {
      const totalTempo =
        gameState.deckATempo + gameState.deckATempoOffset + jogWheelPitchBend;
      deckA.setTempo(totalTempo);
    } else {
      const totalTempo =
        gameState.deckBTempo + gameState.deckBTempoOffset + jogWheelPitchBend;
      deckB.setTempo(totalTempo);
    }
  };

  const updateJogWheelVelocity = (deck: "A" | "B", inputVelocity: number) => {
    const state =
      deck === "A" ? jogWheelStateA.current : jogWheelStateB.current;

    // Update velocity and timestamp
    state.velocity = inputVelocity;
    state.lastInputTime = Date.now();

    // Cancel existing animation frame
    if (state.animationFrameId) {
      cancelAnimationFrame(state.animationFrameId);
    }

    // Start velocity decay animation
    const decayAnimation = () => {
      const now = Date.now();
      const timeSinceInput = now - state.lastInputTime;

      if (timeSinceInput > 50) {
        // 50ms without input starts decay
        // Smooth exponential decay
        state.velocity *= 0.95; // Decay factor - adjust for feel

        // Stop when velocity is very small
        if (Math.abs(state.velocity) < 0.01) {
          state.velocity = 0;
        }
      }

      // Update the game state and apply tempo
      if (deck === "A") {
        setGameState((prev) => ({
          ...prev,
          deckAJogWheelVelocity: state.velocity,
        }));
      } else {
        setGameState((prev) => ({
          ...prev,
          deckBJogWheelVelocity: state.velocity,
        }));
      }

      // Apply the complete tempo calculation
      updateDeckTempo(deck);

      // Continue animation if there's still velocity
      if (state.velocity !== 0) {
        state.animationFrameId = requestAnimationFrame(decayAnimation);
      }
    };

    decayAnimation();
  };

  const maxBpmVariation = 20;

  const initialState: GameState = {
    phase: "setup",
    selectedPattern: null,
    deckATempo: 120,
    deckATempoOffset: 0,
    deckAJogWheelVelocity: 0,
    deckBTempo: 120,
    deckBTempoOffset: 0,
    deckBJogWheelVelocity: 0,
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
    deckA.setTempo(gameState.deckATempo + gameState.deckATempoOffset);
    deckA.setPattern(gameState.selectedPattern.pattern);
    deckA.setVolume(gameState.deckAVolume);

    deckB.setTempo(gameState.deckBTempo + gameState.deckBTempoOffset);
    deckB.setPattern(gameState.selectedPattern.pattern);
    deckB.setVolume(gameState.deckBVolume);

    toast({
      title: "Session started!",
      description:
        "Try to match the tempo of both decks by ear. Deck B's tempo is hidden.",
    });
  };

  const finishSession = () => {
    deckA.stop();
    deckB.stop();

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
    deckA.stop();
    deckB.stop();
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
    deckA.setVolume(finalDeckAVolume);
    deckB.setVolume(finalDeckBVolume);
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
          onDeckAPlay={deckA.start}
          onDeckBPlay={deckB.start}
          onDeckAStop={deckA.stop}
          onDeckBStop={deckB.stop}
          onDeckACue={deckA.start}
          onDeckBCue={deckB.start}
          onDeckAJogWheel={(offset) => {
            updateJogWheelVelocity("A", offset);
          }}
          onDeckBJogWheel={(offset) => {
            updateJogWheelVelocity("B", offset);
          }}
          onCrossfaderChange={handleCrossfaderChange}
          onDeckATempoOffsetChange={(offset) => {
            setGameState((prev) => ({ ...prev, deckATempoOffset: offset }));
            updateDeckTempo("A");
          }}
          onDeckBTempoOffsetChange={(offset) => {
            setGameState((prev) => ({ ...prev, deckBTempoOffset: offset }));
            updateDeckTempo("B");
          }}
          onDeckAVolumeChange={(volume) => {
            setGameState((prev) => ({ ...prev, deckAVolume: volume }));
          }}
          onDeckBVolumeChange={(volume) => {
            setGameState((prev) => ({ ...prev, deckBVolume: volume }));
          }}
          deckAPlaying={deckA.isPlaying}
          deckBPlaying={deckB.isPlaying}
          maxBpmVariation={maxBpmVariation}
        />

        {/* DJ Decks */}
        {gameState.selectedPattern && gameState.phase !== "setup" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <Deck
              deckId="A"
              maxBpmVariation={maxBpmVariation}
              isPlaying={deckA.isPlaying}
              tempo={gameState.deckATempo}
              tempoOffset={gameState.deckATempoOffset}
              volume={gameState.deckAVolume}
              currentBeat={deckA.currentBeat}
              pattern={gameState.selectedPattern.pattern}
              patternName={gameState.selectedPattern.name}
              onPlay={deckA.start}
              onStop={deckA.stop}
              onTempoOffsetChange={(offset) => {
                setGameState((prev) => ({ ...prev, deckATempoOffset: offset }));
                deckA.setTempo(gameState.deckATempo + offset);
              }}
              onVolumeChange={(volume) => {
                setGameState((prev) => ({ ...prev, deckAVolume: volume }));
              }}
            />

            <Deck
              deckId="B"
              maxBpmVariation={maxBpmVariation}
              isPlaying={deckB.isPlaying}
              tempo={gameState.deckBTempo}
              tempoOffset={gameState.deckBTempoOffset}
              volume={gameState.deckBVolume}
              currentBeat={deckB.currentBeat}
              pattern={gameState.selectedPattern.pattern}
              patternName={gameState.selectedPattern.name}
              isHidden={gameState.phase === "playing"}
              onPlay={deckB.start}
              onStop={deckB.stop}
              onTempoOffsetChange={(offset) => {
                setGameState((prev) => ({ ...prev, deckBTempoOffset: offset }));
                deckB.setTempo(gameState.deckBTempo + offset);
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

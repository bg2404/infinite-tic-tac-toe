/// <reference lib="webworker" />
import { Difficulty } from './engine';
import { QuantumSnapshot } from './quantum';
import { getQuantumMove, QuantumAiMove } from './quantumAi';

export interface QuantumAiRequest {
  id: number;
  snapshot: QuantumSnapshot;
  difficulty: Difficulty;
  customDepth: number;
}

export interface QuantumAiResponse {
  id: number;
  move: QuantumAiMove | null;
}

self.onmessage = (event: MessageEvent<QuantumAiRequest>) => {
  const { id, snapshot, difficulty, customDepth } = event.data;
  const move = getQuantumMove(snapshot, difficulty, customDepth);
  const response: QuantumAiResponse = { id, move };
  self.postMessage(response);
};

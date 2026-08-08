import { TtsEngineRegistry } from './engineRegistry'
import { TtsJobManager } from './jobManager'
import { TtsModelManager } from './modelManager'

export const ttsModelManager = new TtsModelManager()
export const ttsEngineRegistry = new TtsEngineRegistry(ttsModelManager)
export const ttsJobManager = new TtsJobManager(ttsModelManager, ttsEngineRegistry)

let activeAgentTtsTasks = 0

export function acquireAgentTts(): boolean {
  if (activeAgentTtsTasks > 0 || ttsJobManager.hasActiveJob()) return false
  activeAgentTtsTasks += 1
  return true
}

export function releaseAgentTts(): void {
  activeAgentTtsTasks = Math.max(0, activeAgentTtsTasks - 1)
}

export function hasActiveAgentTts(): boolean {
  return activeAgentTtsTasks > 0
}

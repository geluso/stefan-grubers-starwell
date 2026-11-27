export type GameRules = Readonly<{
  knightJump: 'short' | 'long'
}>

export const DEFAULT_GAME_RULES: GameRules = Object.freeze({ knightJump: 'long' })

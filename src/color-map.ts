// Piece colors
export const PIECE_WHITE = 'white'
export const PIECE_PURPLE = 'purple'
export const PIECE_YELLOW = 'orange'
export const PIECE_COLORS = [PIECE_WHITE, PIECE_PURPLE, PIECE_YELLOW]

// Tile backgrounds
const WHITE = 'white'
const BLUE = 'dodgerblue'
const PINK = 'hotpink'
const GREEN = 'green'
const YELLOW = 'yellow'

export const COLOR_MAP = {
  // Ring 0
  '(0, 0, 0)': 'transparent',
  // Ring 1
  '(1, -1, 0)': BLUE,
  '(1, 0, -1)': WHITE,
  '(0, 1, -1)': BLUE,
  '(-1, 1, 0)': WHITE,
  '(-1, 0, 1)': BLUE,
  '(0, -1, 1)': WHITE,
  // Ring 2
  '(1, -2, 1)': PINK,
  '(2, -2, 0)': WHITE,
  '(2, -1, -1)': PINK,
  '(2, 0, -2)': BLUE,
  '(1, 1, -2)': PINK,
  '(0, 2, -2)': WHITE,
  '(-1, 2, -1)': PINK,
  '(-2, 2, 0)': BLUE,
  '(-2, 1, 1)': PINK,
  '(-2, 0, 2)': WHITE,
  '(-1, -1, 2)': PINK,
  '(0, -2, 2)': BLUE,
  // Ring 3
  '(2, -3, 1)': BLUE,
  '(3, -3, 0)': PINK,
  '(3, -2, -1)': BLUE,
  '(3, -1, -2)': WHITE,
  '(3, 0, -3)': PINK,
  '(2, 1, -3)': WHITE,
  '(1, 2, -3)': BLUE,
  '(0, 3, -3)': PINK,
  '(-1, 3, -2)': BLUE,
  '(-2, 3, -1)': WHITE,
  '(-3, 3, 0)': PINK,
  '(-3, 2, 1)': WHITE,
  '(-3, 1, 2)': BLUE,
  '(-3, 0, 3)': PINK,
  '(-2, -1, 3)': BLUE,
  '(-1, -2, 3)': WHITE,
  '(0, -3, 3)': PINK,
  '(1, -3, 2)': WHITE,
  // Ring 4
  '(2, -4, 2)': PINK,
  '(3, -4, 1)': WHITE,
  '(4, -4, 0)': BLUE,
  '(4, -3, -1)': WHITE,
  '(4, -2, -2)': PINK,
  '(4, -1, -3)': BLUE,
  '(4, 0, -4)': WHITE,
  '(3, 1, -4)': BLUE,
  '(2, 2, -4)': PINK,
  '(1, 3, -4)': WHITE,
  '(0, 4, -4)': BLUE,
  '(-1, 4, -3)': WHITE,
  '(-2, 4, -2)': PINK,
  '(-3, 4, -1)': BLUE,
  '(-4, 4, 0)': WHITE,
  '(-4, 3, 1)': BLUE,
  '(-4, 2, 2)': PINK,
  '(-4, 1, 3)': WHITE,
  '(-4, 0, 4)': BLUE,
  '(-3, -1, 4)': WHITE,
  '(-2, -2, 4)': PINK,
  '(-1, -3, 4)': BLUE,
  '(0, -4, 4)': WHITE,
  '(1, -4, 3)': BLUE,
  // Ring 5
  '(3, -5, 2)': BLUE,
  '(4, -5, 1)': PINK,
  '(5, -5, 0)': WHITE,
  '(5, -4, -1)': PINK,
  '(5, -3, -2)': BLUE,
  '(5, -2, -3)': WHITE,
  '(5, -1, -4)': PINK,
  '(5, 0, -5)': BLUE,
  '(4, 1, -5)': PINK,
  '(3, 2, -5)': WHITE,
  '(2, 3, -5)': BLUE,
  '(1, 4, -5)': PINK,
  '(0, 5, -5)': WHITE,
  '(-1, 5, -4)': PINK,
  '(-2, 5, -3)': BLUE,
  '(-3, 5, -2)': WHITE,
  '(-4, 5, -1)': PINK,
  '(-5, 5, 0)': BLUE,
  '(-5, 4, 1)': PINK,
  '(-5, 3, 2)': WHITE,
  '(-5, 2, 3)': BLUE,
  '(-5, 1, 4)': PINK,
  '(-5, 0, 5)': WHITE,
  '(-4, -1, 5)': PINK,
  '(-3, -2, 5)': BLUE,
  '(-2, -3, 5)': WHITE,
  '(-1, -4, 5)': PINK,
  '(0, -5, 5)': BLUE,
  '(1, -5, 4)': PINK,
  '(2, -5, 3)': WHITE
}

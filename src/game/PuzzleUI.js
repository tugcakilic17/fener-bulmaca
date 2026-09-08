import * as Phaser from 'phaser'

export const DEFAULT_PUZZLE_WORDS = {
  8: ['FENER', 'DENİZ', 'GEMİ', 'MARTI', 'ADA'],
  10: ['FENER', 'DENİZ', 'GEMİ', 'MARTI', 'ADA', 'DALGA', 'YELKEN', 'KUMSAL'],
  12: ['FENER', 'DENİZ', 'GEMİ', 'MARTI', 'ADA', 'DALGA', 'YELKEN', 'KUMSAL', 'KIYI'],
  14: ['FENER', 'DENİZ', 'GEMİ', 'MARTI', 'ADA', 'DALGA', 'YELKEN', 'KUMSAL', 'KIYI', 'PUSULA', 'KAPTAN', 'LİMAN'],
}

function createPuzzle(size, words) {
  const grid = Array.from({ length: size }, () => Array(size).fill(''))
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]]
  const filler = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'
  let seed = size * 7919

  const random = (max) => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed % max
  }

  words.forEach((word) => {
    const candidates = []
    directions.forEach(([rowStep, colStep]) => {
      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          const endRow = row + rowStep * (word.length - 1)
          const endCol = col + colStep * (word.length - 1)
          if (endRow >= 0 && endRow < size && endCol >= 0 && endCol < size) {
            candidates.push({ row, col, rowStep, colStep })
          }
        }
      }
    })

    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const swapIndex = random(index + 1)
      ;[candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]]
    }

    const placement = candidates.find(({ row, col, rowStep, colStep }) =>
      [...word].every((letter, index) => {
        const current = grid[row + rowStep * index][col + colStep * index]
        return current === '' || current === letter
      }),
    )

    if (!placement) throw new Error(`${size}×${size} gridine ${word} yerleştirilemedi.`)

    const { row, col, rowStep, colStep } = placement
    ;[...word].forEach((letter, index) => {
      grid[row + rowStep * index][col + colStep * index] = letter
    })
  })

  grid.forEach((row) => {
    row.forEach((letter, index) => {
      if (!letter) row[index] = filler[random(filler.length)]
    })
  })

  return { grid: grid.map((row) => row.join('')), words }
}

const PUZZLES = Object.fromEntries(
  Object.entries(DEFAULT_PUZZLE_WORDS).map(([size, words]) => [size, createPuzzle(Number(size), words)]),
)

const FONT = '"Trebuchet MS", "Segoe UI", Arial, sans-serif'
const FRAME_RATIO = 1305 / 1205
const PANEL_RATIO = 1024 / 1536

export default class PuzzleUI {
  constructor(scene, initialSize = 8, initialWords = null, callbacks = {}) {
    this.scene = scene
    this.onPanelChange = callbacks.onPanelChange
    this.onStarArrive = callbacks.onStarArrive
    this.onWordFound = callbacks.onWordFound
    this.onPuzzleComplete = callbacks.onPuzzleComplete
    this.gridSize = initialSize
    this.puzzle = createPuzzle(initialSize, initialWords ?? DEFAULT_PUZZLE_WORDS[initialSize])
    this.foundWords = new Set()
    this.foundCells = new Set()
    this.selectionCells = []
    this.flyingStars = new Set()
  }

  create() {
    this.layout()
  }

  destroy() {
    this.clearFlyingStars()
    this.root?.destroy(true)
    this.onPanelChange?.({ visible: false })
  }

  setGridSize(size) {
    if (!PUZZLES[size]) return

    this.setPuzzle(size, DEFAULT_PUZZLE_WORDS[size])
  }

  setPuzzle(size, words) {
    if (!DEFAULT_PUZZLE_WORDS[size] || !words?.length) return

    this.gridSize = size
    this.puzzle = createPuzzle(size, words)
    this.foundWords.clear()
    this.foundCells.clear()
    this.selectionCells = []
    this.clearFlyingStars()
    this.layout()
  }

  add(object) {
    this.root.add(object)
    return object
  }

  text(x, y, value, style, originX = 0.5, originY = 0.5) {
    return this.add(
      this.scene.add
        .text(Math.round(x), Math.round(y), value, {
          fontFamily: FONT,
          color: '#082653',
          resolution: 3,
          ...style,
        })
        .setOrigin(originX, originY),
    )
  }

  layout() {
    const width = this.scene.scale.width
    const height = this.scene.scale.height
    if (!width || !height) return

    this.clearFlyingStars()
    this.root?.destroy(true)
    this.root = this.scene.add.container(0, 0).setDepth(10)
    this.cells = []

    const layout = this.calculateLayout(width, height)
    this.buildTitle(layout)
    this.buildGrid(layout)
    this.buildWordPanel(layout)
    this.refreshVisuals()
  }

  calculateLayout(width, height) {
    const landscape = width >= 820 && width / height >= 1.12
    const titleWidth = Math.min(width * (landscape ? 0.22 : 0.45), 375)
    const titleHeight = titleWidth / 3

    if (landscape) {
      const contentTop = Math.min(112, height * 0.125)
      let frameHeight = Math.min(870, height * 0.95)
      let frameWidth = frameHeight * FRAME_RATIO
      let panelHeight = Math.min(765, height * 0.82)
      let panelWidth = panelHeight * PANEL_RATIO
      const gap = Math.max(12, Math.min(22, width * 0.012))
      const maxContentWidth = width * 1.18
      const contentWidth = frameWidth + gap + panelWidth

      if (contentWidth > maxContentWidth) {
        const scale = maxContentWidth / contentWidth
        frameHeight *= scale
        frameWidth *= scale
        panelHeight *= scale
        panelWidth *= scale
      }

      const totalWidth = frameWidth + gap + panelWidth
      const centeredX = (width - totalWidth) / 2
      const startX = centeredX + width * 0.14
      const frameY = Math.max(54, contentTop - 37)
      const visibleTop = frameY + frameHeight * (118 / 1205)
      const panelY = visibleTop - panelHeight * (41 / 1536)

      return {
        landscape,
        width,
        height,
        title: { x: (width - titleWidth) / 2, y: 6, width: titleWidth, height: titleHeight },
        frame: { x: startX, y: frameY, width: frameWidth, height: frameHeight },
        panel: {
          x: startX + frameWidth + gap,
          y: panelY,
          width: panelWidth,
          height: panelHeight,
        },
      }
    }

    const frameWidth = Math.min(width - 18, 560)
    const frameHeight = frameWidth / FRAME_RATIO
    const frameY = Math.max(92, titleHeight * 0.78)
    const panelY = frameY + frameHeight - 8
    let panelHeight = Math.min(440, Math.max(250, height - panelY - 8))
    let panelWidth = panelHeight * PANEL_RATIO

    if (panelWidth > width - 24) {
      panelWidth = width - 24
      panelHeight = panelWidth / PANEL_RATIO
    }

    return {
      landscape,
      width,
      height,
      title: { x: (width - titleWidth) / 2, y: 6, width: titleWidth, height: titleHeight },
      frame: { x: (width - frameWidth) / 2, y: frameY, width: frameWidth, height: frameHeight },
      panel: { x: (width - panelWidth) / 2, y: panelY, width: panelWidth, height: panelHeight },
    }
  }

  buildTitle({ title }) {
    this.titleLayout = {
      x: Math.round(title.x),
      y: Math.round(title.y),
      width: Math.round(title.width),
      height: Math.round(title.height),
    }
  }

  buildGrid({ frame }) {
    this.add(
      this.scene.add
        .image(frame.x + frame.width / 2, frame.y + frame.height / 2, 'ui-letter-grid-frame')
        .setDisplaySize(frame.width, frame.height),
    )

    // Görseldeki parşömen alanının gerçek sınırları. Kareye zorlamadığımız için
    // hücreler kenarlara kadar yayılır ve referanstaki hafif dikdörtgen biçimi korur.
    const gridX = frame.x + frame.width * (181 / 1305)
    const gridY = frame.y + frame.height * (185 / 1205)
    const gridWidth = frame.width * ((1124 - 181) / 1305)
    const gridHeight = frame.height * ((1043 - 185) / 1205)
    const stepX = gridWidth / this.gridSize
    const stepY = gridHeight / this.gridSize
    const cellWidth = stepX
    const cellHeight = stepY

    this.gridBounds = { x: gridX, y: gridY, width: gridWidth, height: gridHeight, stepX, stepY }

    for (let row = 0; row < this.gridSize; row += 1) {
      for (let col = 0; col < this.gridSize; col += 1) {
        const x = gridX + col * stepX
        const y = gridY + row * stepY
        const centerX = x + cellWidth / 2
        const centerY = y + cellHeight / 2
        const key = `${row}:${col}`
        const fontSize = Math.round(Phaser.Math.Clamp(Math.min(cellWidth, cellHeight) * 0.43, 17, 35))
        const tile = this.add(
          this.scene.add
            .image(centerX, centerY, 'ui-letter-tile', 'cell')
            .setDisplaySize(cellWidth, cellHeight),
        )
        const highlight = this.add(
          this.scene.add
            .image(centerX, centerY, 'ui-letter-tile', 'cell')
            .setDisplaySize(cellWidth, cellHeight)
            .setTint(0xffdf67)
            .setAlpha(0),
        )
        const label = this.text(centerX, centerY - cellHeight * 0.015, this.puzzle.grid[row][col], {
          fontSize: `${fontSize}px`,
          fontStyle: 'bold',
          stroke: '#082653',
          strokeThickness: 0.45,
        })
        const zone = this.add(this.scene.add.zone(x, y, cellWidth, cellHeight).setOrigin(0))
        zone.setInteractive({ useHandCursor: true })
        zone.on('pointerdown', () => this.handleCellClick(row, col))

        this.cells.push({
          row,
          col,
          key,
          x,
          y,
          centerX,
          centerY,
          width: cellWidth,
          height: cellHeight,
          tile,
          highlight,
          visualState: 'idle',
          label,
        })
      }
    }
  }

  buildWordPanel({ panel }) {
    this.add(
      this.scene.add
        .image(panel.x + panel.width / 2, panel.y + panel.height / 2, 'ui-word-list-panel')
        .setDisplaySize(panel.width, panel.height),
    )

    const centerX = Math.round(panel.x + panel.width / 2)
    const badgeY = Math.round(panel.y + panel.height * 0.273)
    const starSize = Math.round(Phaser.Math.Clamp(panel.height * 0.073, 44, 58))
    const starX = Math.round(centerX - starSize * 0.4)
    const columns = this.puzzle.words.length >= 8 ? 2 : 1
    const rowsPerColumn = Math.ceil(this.puzzle.words.length / columns)
    this.starTarget = { x: starX, y: badgeY }
    this.panelLayout = {
      visible: true,
      x: Math.round(panel.x),
      y: Math.round(panel.y),
      width: Math.round(panel.width),
      height: Math.round(panel.height),
      starSize,
      columns,
      rowsPerColumn,
    }
  }

  drawCellBackground(cell, state) {
    if (cell.visualState === state) return

    cell.visualState = state
    this.scene.tweens.killTweensOf(cell.highlight)

    const active = state === 'selected' || state === 'found'
    cell.highlight.setTint(0xffdf67)
    this.scene.tweens.add({
      targets: cell.highlight,
      alpha: active ? 1 : 0,
      duration: active ? 220 : 170,
      ease: 'Sine.easeOut',
    })
  }

  refreshVisuals() {
    const selectedKeys = new Set(this.selectionCells.map((cell) => cell.key))

    this.cells.forEach((cell) => {
      const state = this.foundCells.has(cell.key)
        ? 'found'
        : selectedKeys.has(cell.key)
          ? 'selected'
          : 'idle'
      this.drawCellBackground(cell, state)
      cell.label.setColor(state === 'idle' ? '#082653' : '#57320a')
    })

    this.emitPanelState()
  }

  emitPanelState() {
    if (!this.panelLayout || !this.onPanelChange) return
    this.onPanelChange({
      ...this.panelLayout,
      title: { ...this.titleLayout },
      words: [...this.puzzle.words],
      foundWords: [...this.foundWords],
      foundCount: this.foundWords.size,
      total: this.puzzle.words.length,
      selectionActive: this.selectionCells.length > 0,
    })
  }

  handleCellClick(row, col) {
    const cell = this.cells.find((candidate) => candidate.row === row && candidate.col === col)
    if (!cell) return

    if (this.selectionCells.length === 0) {
      this.selectionCells = [cell]
      this.refreshVisuals()
      return
    }

    const selectedIndex = this.selectionCells.findIndex((selectedCell) => selectedCell.key === cell.key)
    if (selectedIndex >= 0) {
      // Bir önceki harfe tekrar tıklamak seçimde geri adım atar.
      if (selectedIndex === this.selectionCells.length - 2) {
        this.selectionCells.pop()
      } else if (selectedIndex === this.selectionCells.length - 1) {
        this.selectionCells.pop()
      }
      this.refreshVisuals()
      return
    }

    const previous = this.selectionCells[this.selectionCells.length - 1]
    const isNeighbor = Math.abs(cell.row - previous.row) <= 1 && Math.abs(cell.col - previous.col) <= 1

    if (!isNeighbor) {
      // Uzak bir kutuya tıklamak yeni kelime seçimini başlatır.
      this.selectionCells = [cell]
      this.refreshVisuals()
      return
    }

    this.selectionCells.push(cell)

    const selected = this.selectionCells.map((selectedCell) => this.puzzle.grid[selectedCell.row][selectedCell.col]).join('')
    const reversed = [...selected].reverse().join('')
    const word = this.puzzle.words.find(
      (candidate) => !this.foundWords.has(candidate) && (candidate === selected || candidate === reversed),
    )

    if (word) {
      const completedCells = [...this.selectionCells]
      this.foundWords.add(word)
      completedCells.forEach((selectedCell) => this.foundCells.add(selectedCell.key))
      this.selectionCells = []
      this.refreshVisuals()
      this.onWordFound?.(word)
      this.animateCompletedWord(completedCells)
      this.animateStarReward(completedCells)
      if (this.foundWords.size === this.puzzle.words.length) {
        this.onPuzzleComplete?.({
          gridSize: this.gridSize,
          words: [...this.puzzle.words],
        })
      }
      return
    }

    this.refreshVisuals()
  }

  animateCompletedWord(cells) {
    cells.forEach((cell, index) => {
      const objects = [cell.tile, cell.highlight, cell.label]
      const initial = objects.map((object) => ({
        y: object.y,
        scaleX: object.scaleX,
        scaleY: object.scaleY,
      }))
      const motion = { progress: 0 }
      const lift = Phaser.Math.Clamp(cell.height * 0.16, 6, 13)

      this.scene.tweens.add({
        targets: motion,
        progress: 1,
        delay: index * 55,
        duration: 360,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          const pulse = Math.sin(motion.progress * Math.PI)
          objects.forEach((object, objectIndex) => {
            const start = initial[objectIndex]
            object.setY(start.y - lift * pulse)
            object.setScale(
              start.scaleX * (1 + pulse * 0.045),
              start.scaleY * (1 + pulse * 0.045),
            )
          })
        },
        onComplete: () => {
          objects.forEach((object, objectIndex) => {
            const start = initial[objectIndex]
            object.setY(start.y)
            object.setScale(start.scaleX, start.scaleY)
          })
        },
      })
    })
  }

  clearFlyingStars() {
    this.flyingStars.forEach((star) => star.destroy())
    this.flyingStars.clear()
  }

  animateStarReward(cells) {
    if (!cells.length || !this.starTarget) return

    const startX = cells.reduce((sum, cell) => sum + cell.centerX, 0) / cells.length
    const startY = cells.reduce((sum, cell) => sum + cell.centerY, 0) / cells.length
    const target = { ...this.starTarget }
    const starSize = Phaser.Math.Clamp(cells[0].height * 0.78, 34, 62)
    const star = this.scene.add.image(startX, startY, 'ui-star').setDisplaySize(starSize, starSize).setDepth(40)
    const baseScale = { x: star.scaleX, y: star.scaleY }
    star.setScale(baseScale.x * 0.15, baseScale.y * 0.15).setAlpha(0)
    this.flyingStars.add(star)

    this.scene.tweens.add({
      targets: star,
      alpha: 1,
      scaleX: baseScale.x * 1.15,
      scaleY: baseScale.y * 1.15,
      y: startY - Phaser.Math.Clamp(cells[0].height * 0.2, 8, 16),
      angle: -12,
      duration: 230,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (!star.active || !this.starTarget) return
        const flightStart = { x: star.x, y: star.y }
        const control = {
          x: (flightStart.x + target.x) / 2,
          y: Math.min(flightStart.y, target.y) - Phaser.Math.Clamp(this.scene.scale.height * 0.13, 80, 135),
        }
        const motion = { progress: 0 }

        this.scene.tweens.add({
          targets: motion,
          progress: 1,
          duration: 620,
          ease: 'Cubic.easeInOut',
          onUpdate: () => {
            if (!star.active) return
            const t = motion.progress
            const inverse = 1 - t
            star.setPosition(
              inverse * inverse * flightStart.x + 2 * inverse * t * control.x + t * t * target.x,
              inverse * inverse * flightStart.y + 2 * inverse * t * control.y + t * t * target.y,
            )
            star.setAngle(-12 + t * 390)
            const scale = 1.15 - t * 0.55
            star.setScale(baseScale.x * scale, baseScale.y * scale)
          },
          onComplete: () => {
            this.flyingStars.delete(star)
            star.destroy()
            this.onStarArrive?.()
          },
        })
      },
    })
  }
}

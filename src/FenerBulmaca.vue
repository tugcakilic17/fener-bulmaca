<script setup>
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import * as Phaser from 'phaser'

import lighthouseUrl from './assets/background/lighthouse.webp'
import seaUrl from './assets/background/sea.webp'
import skyUrl from './assets/background/sky.webp'
import starsUrl from './assets/background/stars.webp'
import lighthouseGlowUrl from './assets/background/lighthouse_glow.webp'
import gameTitleUrl from './assets/ui/game_title.webp'
import letterGridFrameUrl from './assets/ui/letter_grid_frame.webp'
import letterTileUrl from './assets/ui/letter_tile.webp'
import starIconUrl from './assets/ui/star.webp'
import wordListPanelUrl from './assets/ui/word_list_panel.webp'

const props = defineProps({
  engine: { type: Object, required: true },
  params: { type: Object, required: true },
  pool: { type: Array, default: null },
})

const live = inject('liveSettings', { sizeScale: 1, elementCount: null, speed: 100 })

const GAME_WIDTH = 1672
const GAME_HEIGHT = 941
const WATER_MAP_SIZE = 128
const WATER_MAP_KEY = 'water-displacement-map'
const SHOOTING_STAR_KEY = 'shooting-star'
const DEFAULT_PUZZLE_WORDS = {
  8: ['FENER', 'DENİZ', 'GEMİ', 'MARTI', 'ADA'],
  10: ['FENER', 'DENİZ', 'GEMİ', 'MARTI', 'ADA', 'DALGA', 'YELKEN', 'KUMSAL'],
  12: ['FENER', 'DENİZ', 'GEMİ', 'MARTI', 'ADA', 'DALGA', 'YELKEN', 'KUMSAL', 'KIYI'],
  14: ['FENER', 'DENİZ', 'GEMİ', 'MARTI', 'ADA', 'DALGA', 'YELKEN', 'KUMSAL', 'KIYI', 'PUSULA', 'KAPTAN', 'LİMAN'],
}

function createPuzzle(size, words, roundSeed = 0) {
  const grid = Array.from({ length: size }, () => Array(size).fill(''))
  const wordPaths = {}
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]]
  const filler = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'
  let seed = size * 7919 + roundSeed * 104729

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
    wordPaths[word] = [...word].map((_, index) => ({
      row: row + rowStep * index,
      col: col + colStep * index,
    }))
    ;[...word].forEach((letter, index) => {
      grid[row + rowStep * index][col + colStep * index] = letter
    })
  })

  grid.forEach((row) => {
    row.forEach((letter, index) => {
      if (!letter) row[index] = filler[random(filler.length)]
    })
  })

  return { grid: grid.map((row) => row.join('')), words, wordPaths }
}

const PUZZLES = Object.fromEntries(
  Object.entries(DEFAULT_PUZZLE_WORDS).map(([size, words]) => [size, createPuzzle(Number(size), words)]),
)

const FONT = '"Trebuchet MS", "Segoe UI", Arial, sans-serif'
const FRAME_RATIO = 1305 / 1205
const PANEL_RATIO = 1024 / 1536

class PuzzleUI {
  constructor(scene, initialSize = 8, initialWords = null, initialSeed = 0, callbacks = {}) {
    this.scene = scene
    this.onPanelChange = callbacks.onPanelChange
    this.onStarArrive = callbacks.onStarArrive
    this.onWordFound = callbacks.onWordFound
    this.onPuzzleComplete = callbacks.onPuzzleComplete
    this.textScale = callbacks.textScale ?? 1
    this.durationScale = callbacks.durationScale ?? 1
    this.gridSize = initialSize
    this.puzzle = createPuzzle(initialSize, initialWords ?? DEFAULT_PUZZLE_WORDS[initialSize], initialSeed)
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

  setPuzzle(size, words, roundSeed = 0) {
    if (!DEFAULT_PUZZLE_WORDS[size] || !words?.length) return

    this.gridSize = size
    this.puzzle = createPuzzle(size, words, roundSeed)
    this.foundWords.clear()
    this.foundCells.clear()
    this.selectionCells = []
    this.clearFlyingStars()
    this.layout()
  }

  setLiveSettings({ textScale = 1, durationScale = 1 } = {}) {
    const shouldRelayout = Math.abs(this.textScale - textScale) > 0.01
    this.textScale = textScale
    this.durationScale = durationScale
    if (shouldRelayout) this.layout()
  }

  duration(milliseconds) {
    return Math.max(80, Math.round(milliseconds * this.durationScale))
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

    const selectedKeys = new Set(this.selectionCells.map((cell) => cell.key))
    this.clearFlyingStars()
    this.root?.destroy(true)
    this.root = this.scene.add.container(0, 0).setDepth(10)
    this.cells = []

    const layout = this.calculateLayout(width, height)
    this.buildTitle(layout)
    this.buildGrid(layout)
    this.selectionCells = this.cells.filter((cell) => selectedKeys.has(cell.key))
    this.buildWordPanel(layout)
    this.refreshVisuals()
  }

  calculateLayout(width, height) {
    // Orta boy kare ekranlarda da yan yana yerlesim, ust uste yerlesimin
    // oyunu gereksiz yere kucultmesini engeller.
    const landscape = (width >= 820 && width / height >= 1.12) || (width >= 560 && width / height >= 0.95)
    const edgePadding = Phaser.Math.Clamp(width * 0.015, 9, 28)
    const bottomPadding = Phaser.Math.Clamp(height * 0.015, 8, 18)
    const titleWidth = Math.min(width * (landscape ? 0.22 : 0.45), 375)
    const titleHeight = titleWidth / 3

    if (landscape) {
      const contentTop = Math.min(112, height * 0.125)
      const frameY = Math.max(54, contentTop - 37)
      let frameHeight = Math.min(870, height * 0.95)
      let frameWidth = frameHeight * FRAME_RATIO
      let panelHeight = Math.min(765, height * 0.82)
      let panelWidth = panelHeight * PANEL_RATIO
      const gap = Math.max(12, Math.min(22, width * 0.012))
      const contentWidth = frameWidth + gap + panelWidth
      const maxContentWidth = Math.max(1, width - edgePadding * 2)
      const maxContentHeight = Math.max(1, height - frameY - bottomPadding)
      const frameHeightScale = maxContentHeight / frameHeight
      const panelBottomAtUnitScale =
        frameHeight * (118 / 1205) + panelHeight * (1 - 41 / 1536)
      const panelHeightScale = maxContentHeight / panelBottomAtUnitScale
      const scale = Math.min(1, maxContentWidth / contentWidth, frameHeightScale, panelHeightScale)

      frameHeight *= scale
      frameWidth *= scale
      panelHeight *= scale
      panelWidth *= scale

      const totalWidth = frameWidth + gap + panelWidth
      const centeredX = (width - totalWidth) / 2
      // Genis ekranlarda deniz fenerine nefes alani birakmak icin oyun grubunu
      // saga yaklastir. Dar ekranlarda kayma sifira iner; panel asla kesilmez.
      const desiredRightShift = width * 0.14
      const safeRightShift = Math.max(0, centeredX - edgePadding)
      const startX = centeredX + Math.min(desiredRightShift, safeRightShift)
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

    const frameY = Math.max(72, titleHeight * 0.78)
    let frameWidth = Math.min(width - edgePadding * 2, 560)
    let frameHeight = frameWidth / FRAME_RATIO
    let panelHeight = Math.min(440, frameHeight * 1.15)
    let panelWidth = panelHeight * PANEL_RATIO
    const overlap = Math.min(8, height * 0.012)
    const contentHeight = frameHeight + panelHeight - overlap
    const maxContentHeight = Math.max(1, height - frameY - bottomPadding)
    const maxPanelWidth = Math.max(1, width - edgePadding * 2)
    const scale = Math.min(1, maxContentHeight / contentHeight, maxPanelWidth / panelWidth)

    frameWidth *= scale
    frameHeight *= scale
    panelWidth *= scale
    panelHeight *= scale
    const panelY = frameY + frameHeight - overlap

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
        const fontSize = Math.round(
          Phaser.Math.Clamp(Math.min(cellWidth, cellHeight) * 0.43 * this.textScale, 10, 42),
        )
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
    const starSize = Math.round(Phaser.Math.Clamp(panel.height * 0.073, 24, 58))
    const starX = Math.round(panel.x + panel.width * 0.225)
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
      duration: this.duration(active ? 220 : 170),
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
      this.animateStarReward(completedCells, word)
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

  showHint() {
    let cell = null

    if (this.selectionCells.length > 0) {
      const selectedText = this.selectionCells
        .map((selectedCell) => this.puzzle.grid[selectedCell.row][selectedCell.col])
        .join('')
      const lastSelected = this.selectionCells[this.selectionCells.length - 1]
      const selectedKeys = new Set(this.selectionCells.map((selectedCell) => selectedCell.key))

      for (const word of this.puzzle.words) {
        if (this.foundWords.has(word)) continue
        const forwardPath = this.puzzle.wordPaths[word] ?? []
        const variants = [
          { text: word, path: forwardPath },
          { text: [...word].reverse().join(''), path: [...forwardPath].reverse() },
        ]

        for (const variant of variants) {
          if (!variant.text.startsWith(selectedText) || selectedText.length >= variant.text.length) continue

          const expectedLetter = [...variant.text][this.selectionCells.length]
          const nextStep = variant.path[this.selectionCells.length]
          const pathCell = nextStep
            ? this.cells.find((candidate) => candidate.row === nextStep.row && candidate.col === nextStep.col)
            : null
          const pathCellIsUsable = pathCell
            && !selectedKeys.has(pathCell.key)
            && Math.abs(pathCell.row - lastSelected.row) <= 1
            && Math.abs(pathCell.col - lastSelected.col) <= 1

          cell = pathCellIsUsable
            ? pathCell
            : this.cells.find((candidate) =>
              !selectedKeys.has(candidate.key)
              && Math.abs(candidate.row - lastSelected.row) <= 1
              && Math.abs(candidate.col - lastSelected.col) <= 1
              && this.puzzle.grid[candidate.row][candidate.col] === expectedLetter,
            )
          if (cell) break
        }
        if (cell) break
      }
    }

    if (!cell) {
      const word = this.puzzle.words.find((candidate) => !this.foundWords.has(candidate))
      const firstStep = word ? this.puzzle.wordPaths[word]?.[0] : null
      cell = firstStep
        ? this.cells.find((candidate) => candidate.row === firstStep.row && candidate.col === firstStep.col)
        : null
    }
    if (!cell) return false

    this.scene.tweens.killTweensOf(cell.highlight)
    cell.highlight.setTint(0x74dfff).setAlpha(0)
    this.scene.tweens.add({
      targets: cell.highlight,
      alpha: 1,
      duration: this.duration(230),
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        cell.visualState = ''
        const selected = this.selectionCells.some((selectedCell) => selectedCell.key === cell.key)
        const state = this.foundCells.has(cell.key) ? 'found' : selected ? 'selected' : 'idle'
        this.drawCellBackground(cell, state)
      },
    })
    return true
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
        delay: Math.round(index * 55 * this.durationScale),
        duration: this.duration(360),
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

  animateStarReward(cells, word) {
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
      duration: this.duration(230),
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
          duration: this.duration(620),
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
            this.onStarArrive?.(word)
          },
        })
      },
    })
  }
}
const GRID_SIZES = [8, 10, 12, 14]
const WORD_COUNTS = { 8: 5, 10: 8, 12: 9, 14: 12 }

function clampNumber(value, minimum, maximum, fallback) {
  if (value === null || value === undefined || value === '') return fallback
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : fallback
}

function scaledPanelFont(baseSize, minimum, maximum) {
  const value = Math.min(maximum, Math.max(minimum, baseSize * liveTextScale.value))
  return `${Math.round(value * 10) / 10}px`
}

const gameContainer = ref(null)
const liveTextScale = computed(() => clampNumber(live.sizeScale, 0.75, 1.5, 1))
const liveDurationScale = computed(() => 100 / clampNumber(live.speed, 50, 200, 100))
const gridSize = computed(() => {
  const levelDefault = { kolay: 8, orta: 10, zor: 12 }[props.params.level] ?? 8
  const requested = Number(props.params.gridSize ?? levelDefault)
  return GRID_SIZES.includes(requested) ? requested : levelDefault
})
const configuredRounds = computed(() =>
  Math.round(clampNumber(props.params.rounds ?? props.engine.total?.value, 3, 30, 3)),
)
const hintCount = computed(() => Math.round(clampNumber(props.params.hintCount, 0, 9, 3)))
const roundWords = computed(() => {
  const size = gridSize.value
  const count = Math.round(clampNumber(live.elementCount, 1, WORD_COUNTS[size], WORD_COUNTS[size]))
  const level = props.params.level
  const poolWords = (props.pool ?? [])
    .filter((item) => !item?.meta?.zorluk || item.meta.zorluk === level)
    .map((item) => String(item?.body ?? '').trim().toLocaleUpperCase('tr-TR').replace(/[^A-ZÇĞİÖŞÜ]/g, ''))
    .filter((word, index, words) => word.length >= 3 && word.length <= size && words.indexOf(word) === index)
  const fallback = DEFAULT_PUZZLE_WORDS[size]
  return [...poolWords, ...fallback.filter((word) => !poolWords.includes(word))].slice(0, count)
})
const wordPanel = reactive({
  visible: false,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  starSize: 48,
  columns: 1,
  rowsPerColumn: 5,
  words: [],
  foundWords: [],
  foundCount: 0,
  total: 0,
  selectionActive: false,
  starPulse: 0,
  title: null,
})
const roundScore = ref(0)
const remainingHints = ref(hintCount.value)
const usedHints = ref(0)
const hintBusy = ref(false)
const roundComplete = computed(() => wordPanel.total > 0 && wordPanel.foundCount === wordPanel.total)
let game = null
let answerTimer = null
let hintTimer = null
let answerLocked = false
let pendingRound = null
let roundStartedAt = performance.now()

function updateWordPanel(state) {
  Object.assign(wordPanel, state)
}

function pulseWordPanelStar(word) {
  wordPanel.starPulse += 1
  roundScore.value += [...String(word ?? '')].length * 10
}

function useHint() {
  if (hintBusy.value || answerLocked || remainingHints.value <= 0 || props.engine.finished.value) return
  const scene = game?.scene.getScene('BackgroundScene')
  if (!scene?.showHint()) return

  remainingHints.value -= 1
  usedHints.value += 1
  hintBusy.value = true
  if (hintTimer) window.clearTimeout(hintTimer)
  hintTimer = window.setTimeout(() => {
    hintBusy.value = false
    hintTimer = null
  }, Math.round(1550 * liveDurationScale.value))
}

function completePuzzle(meta) {
  if (answerLocked || props.engine.finished.value) return
  answerLocked = true
  answerTimer = window.setTimeout(() => {
    props.engine.answer(true, {
      tip: 'dogru',
      gridSize: meta.gridSize,
      bulunanKelimeler: meta.words,
      ipucuKullanimi: usedHints.value,
      tepkiSuresiMs: Math.round(performance.now() - roundStartedAt),
      ayarlananTurSayisi: configuredRounds.value,
    }, meta.words.length)
  }, Math.round(1100 * liveDurationScale.value))
}

class BackgroundScene extends Phaser.Scene {
  constructor() {
    super('BackgroundScene')
  }

  preload() {
    this.load.image('sky', skyUrl)
    this.load.image('stars', starsUrl)
    this.load.image('sea', seaUrl)
    this.load.image('lighthouse', lighthouseUrl)
    this.load.image('ui-lighthouse-glow', lighthouseGlowUrl)
    this.load.image('ui-letter-grid-frame', letterGridFrameUrl)
    this.load.image('ui-letter-tile', letterTileUrl)
    this.load.image('ui-star', starIconUrl)
    this.load.image('ui-word-list-panel', wordListPanelUrl)
  }

  create() {
    this.cameras.main.setRoundPixels(true)

    // Tile görselinin geniş şeffaf dış payını kırpar; kutular grid içinde boşluksuz oturur.
    const tileTexture = this.textures.get('ui-letter-tile')
    if (!tileTexture.has('cell')) tileTexture.add('cell', 0, 130, 152, 993, 965)

    // Her katman aynı tuval boyutuna ve aynı merkeze sahip.
    // Böylece başlangıçta piksel piksel hizalı kalırlar.
    this.backgroundLayers = {
      sky: this.add.image(0, 0, 'sky').setDepth(0),
      stars: this.add.image(0, 0, 'stars').setDepth(1),
      sea: this.add.image(0, 0, 'sea').setDepth(2),
      lighthouse: this.add.image(0, 0, 'lighthouse').setDepth(3),
      lighthouseGlow: this.add
        .image(0, 0, 'ui-lighthouse-glow')
        .setDepth(4)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0)
        .setVisible(false),
    }

    this.createTwinklingStars()
    this.createShootingStarTexture()
    this.scheduleShootingStar(4000)
    this.createWaterDisplacement()
    this.resizeBackground(this.scale.gameSize)
    const initialRound = pendingRound ?? { size: gridSize.value, words: roundWords.value, seed: props.engine.round.value }
    this.puzzleUI = new PuzzleUI(this, initialRound.size, initialRound.words, initialRound.seed, {
      onPanelChange: updateWordPanel,
      onStarArrive: pulseWordPanelStar,
      onWordFound: () => this.playLighthouseGlow(),
      onPuzzleComplete: completePuzzle,
      textScale: liveTextScale.value,
      durationScale: liveDurationScale.value,
    })
    this.puzzleUI.create()
    this.scale.on('resize', this.resizeBackground, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.resizeBackground, this)
      this.puzzleUI?.destroy()

      if (this.textures.exists(WATER_MAP_KEY)) {
        this.textures.remove(WATER_MAP_KEY)
      }

      if (this.textures.exists(SHOOTING_STAR_KEY)) {
        this.textures.remove(SHOOTING_STAR_KEY)
      }
    })
  }

  findStarBounds() {
    const sourceImage = this.textures.get('stars').getSourceImage()
    const canvas = document.createElement('canvas')
    canvas.width = GAME_WIDTH
    canvas.height = GAME_HEIGHT

    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(sourceImage, 0, 0)

    const pixels = context.getImageData(0, 0, GAME_WIDTH, GAME_HEIGHT).data
    const visited = new Uint8Array(GAME_WIDTH * GAME_HEIGHT)
    const queue = new Int32Array(GAME_WIDTH * GAME_HEIGHT)
    const components = []

    for (let pixel = 0; pixel < visited.length; pixel += 1) {
      if (visited[pixel] || pixels[pixel * 4 + 3] < 18) continue

      let head = 0
      let tail = 0
      let area = 0
      let minX = GAME_WIDTH
      let minY = GAME_HEIGHT
      let maxX = 0
      let maxY = 0

      visited[pixel] = 1
      queue[tail] = pixel
      tail += 1

      while (head < tail) {
        const current = queue[head]
        head += 1

        const x = current % GAME_WIDTH
        const y = Math.floor(current / GAME_WIDTH)
        area += 1
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)

        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const neighborY = y + offsetY
          if (neighborY < 0 || neighborY >= GAME_HEIGHT) continue

          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) continue

            const neighborX = x + offsetX
            if (neighborX < 0 || neighborX >= GAME_WIDTH) continue

            const neighbor = neighborY * GAME_WIDTH + neighborX
            if (visited[neighbor] || pixels[neighbor * 4 + 3] < 18) continue

            visited[neighbor] = 1
            queue[tail] = neighbor
            tail += 1
          }
        }
      }

      if (area >= 2) {
        const padding = 12
        const x = Math.max(0, minX - padding)
        const y = Math.max(0, minY - padding)
        const right = Math.min(GAME_WIDTH, maxX + padding + 1)
        const bottom = Math.min(GAME_HEIGHT, maxY + padding + 1)

        components.push({
          x,
          y,
          width: right - x,
          height: bottom - y,
          area,
        })
      }
    }

    return components
  }

  createTwinklingStars() {
    const starsTexture = this.textures.get('stars')
    const components = this.findStarBounds().sort((a, b) => b.area - a.area)

    this.backgroundLayers.stars.setVisible(false)
    this.starSprites = components.map((bounds, index) => {
      const frameKey = `detected-star-${index}`
      if (starsTexture.has(frameKey)) starsTexture.remove(frameKey)

      starsTexture.add(
        frameKey,
        0,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
      )

      const sourceX = bounds.x + bounds.width / 2
      const sourceY = bounds.y + bounds.height / 2
      const visualSize = Math.max(bounds.width, bounds.height)
      const intensity = Phaser.Math.Clamp((visualSize - 20) / 42, 0.15, 1)
      const sprite = this.add
        .image(sourceX, sourceY, 'stars', frameKey)
        .setDepth(1)
        .setBlendMode(Phaser.BlendModes.NORMAL)

      let glow = null
      if (this.game.renderer.gl && index < 8) {
        sprite.enableFilters()
        glow = sprite.filters.internal.addGlow(
          0xffd36a,
          0.6 + intensity * 0.9,
          0,
          1,
          false,
          4,
          6,
        )
        glow.setPaddingOverride(null)
      }

      return {
        sprite,
        glow,
        sourceX,
        sourceY,
        intensity,
        phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
        speed: Phaser.Math.FloatBetween(0.001, 0.0022),
      }
    })
  }

  createShootingStarTexture() {
    if (this.textures.exists(SHOOTING_STAR_KEY)) {
      this.textures.remove(SHOOTING_STAR_KEY)
    }

    const texture = this.textures.createCanvas(SHOOTING_STAR_KEY, 180, 20)
    const context = texture.getContext()
    const gradient = context.createLinearGradient(0, 0, 180, 0)

    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
    gradient.addColorStop(0.72, 'rgba(170, 220, 255, 0.28)')
    gradient.addColorStop(1, 'rgba(255, 245, 196, 1)')
    context.fillStyle = gradient
    context.fillRect(0, 8, 174, 4)
    context.fillStyle = '#fff4bc'
    context.beginPath()
    context.arc(174, 10, 5, 0, Math.PI * 2)
    context.fill()
    texture.refresh()
  }

  scheduleShootingStar(delay) {
    this.time.delayedCall(delay, () => {
      if (!this.viewportCenter) return

      const viewportWidth = this.scale.width
      const viewportHeight = this.scale.height
      const startX = Phaser.Math.Between(viewportWidth * 0.35, viewportWidth * 0.78)
      const startY = Phaser.Math.Between(viewportHeight * 0.08, viewportHeight * 0.28)
      const distance = Math.min(viewportWidth, viewportHeight * 1.7) * 0.28
      const shootingStar = this.add
        .image(startX, startY, SHOOTING_STAR_KEY)
        .setDepth(1.8)
        .setRotation(Phaser.Math.DegToRad(27))
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(Phaser.Math.FloatBetween(0.75, 1.05))

      this.tweens.add({
        targets: shootingStar,
        x: startX + distance,
        y: startY + distance * 0.51,
        alpha: 0,
        duration: Phaser.Math.Between(750, 1050),
        ease: 'Quad.easeIn',
        onComplete: () => {
          shootingStar.destroy()
          this.scheduleShootingStar(Phaser.Math.Between(8000, 15000))
        },
      })
    })
  }

  createWaterDisplacement() {
    // Phaser 4 displacement filtresi WebGL üzerinde deniz dokusunun
    // piksellerini dinamik bir dalga haritasına göre büker.
    if (!this.game.renderer.gl) {
      this.hasWaterShader = false
      return
    }

    if (this.textures.exists(WATER_MAP_KEY)) {
      this.textures.remove(WATER_MAP_KEY)
    }

    this.waterMap = this.textures.createCanvas(
      WATER_MAP_KEY,
      WATER_MAP_SIZE,
      WATER_MAP_SIZE,
    )
    this.waterMapContext = this.waterMap.getContext()
    this.waterMapPixels = this.waterMapContext.createImageData(
      WATER_MAP_SIZE,
      WATER_MAP_SIZE,
    )
    this.lastWaterMapUpdate = -Infinity
    this.renderWaterMap(0)

    const sea = this.backgroundLayers.sea
    sea.enableFilters()
    this.waterDisplacement = sea.filters.internal.addDisplacement(
      WATER_MAP_KEY,
      0.032,
      0.016,
    )
    this.waterDisplacement.setPaddingOverride(null)
    this.hasWaterShader = true
  }

  renderWaterMap(time) {
    const pixels = this.waterMapPixels.data
    const phase = time * 0.0022
    let pixelIndex = 0

    for (let y = 0; y < WATER_MAP_SIZE; y += 1) {
      const normalizedY = y / (WATER_MAP_SIZE - 1)
      const waterDepth = Phaser.Math.Clamp(
        (normalizedY - 0.5) / 0.5,
        0,
        1,
      )
      const strength = waterDepth * (0.35 + waterDepth * 0.65)

      for (let x = 0; x < WATER_MAP_SIZE; x += 1) {
        const longWave = Math.sin(
          y * 0.72 + phase + Math.sin(x * 0.11 + phase * 0.35) * 1.3,
        )
        const crossingWave = Math.sin(x * 0.2 + y * 0.17 - phase * 1.25)
        const verticalWave = Math.cos(x * 0.16 - y * 0.09 + phase * 0.8)

        pixels[pixelIndex] = Phaser.Math.Clamp(
          128 + (longWave * 0.72 + crossingWave * 0.28) * 112 * strength,
          0,
          255,
        )
        pixels[pixelIndex + 1] = Phaser.Math.Clamp(
          128 + verticalWave * 82 * strength,
          0,
          255,
        )
        pixels[pixelIndex + 2] = 128
        pixels[pixelIndex + 3] = 255
        pixelIndex += 4
      }
    }

    this.waterMapContext.putImageData(this.waterMapPixels, 0, 0)
    this.waterMap.refresh()
  }

  resizeBackground(gameSize) {
    const viewportWidth = gameSize.width
    const viewportHeight = gameSize.height
    const coverScale = Math.max(
      viewportWidth / GAME_WIDTH,
      viewportHeight / GAME_HEIGHT,
    )

    this.viewportCenter = {
      x: viewportWidth / 2,
      y: viewportHeight / 2,
    }
    this.coverScale = coverScale

    Object.values(this.backgroundLayers).forEach((layer) => {
      layer
        .setPosition(viewportWidth / 2, viewportHeight / 2)
        .setScale(coverScale)
    })

    // Filtrenin kenarlarda örnekleyebilmesi için küçük bir taşma payı bırakılır.
    this.backgroundLayers.sea.setScale(coverScale * 1.025)

    this.starSprites.forEach((star) => {
      star.sprite
        .setPosition(
          viewportWidth / 2 + (star.sourceX - GAME_WIDTH / 2) * coverScale,
          viewportHeight / 2 + (star.sourceY - GAME_HEIGHT / 2) * coverScale,
        )
        .setScale(coverScale)
    })

    this.puzzleUI?.layout()
  }

  startRound(size, words, seed) {
    this.puzzleUI?.setPuzzle(size, words, seed)
  }

  showHint() {
    return this.puzzleUI?.showHint() ?? false
  }

  applyLiveSettings(textScale, durationScale) {
    this.puzzleUI?.setLiveSettings({ textScale, durationScale })
  }

  playLighthouseGlow() {
    const glow = this.backgroundLayers?.lighthouseGlow
    if (!glow || !this.coverScale) return

    this.tweens.killTweensOf(glow)
    const baseScale = this.coverScale
    const motion = { progress: 0 }

    glow
      .setVisible(true)
      .setAlpha(0)
      .setScale(baseScale * 0.96)

    this.tweens.add({
      targets: motion,
      progress: 1,
      duration: Math.max(80, Math.round(1050 * liveDurationScale.value)),
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const progress = motion.progress
        const envelope = Math.sin(progress * Math.PI)
        const shimmer = 0.82 + Math.sin(progress * Math.PI * 5) ** 2 * 0.18
        glow
          .setAlpha(envelope * shimmer * 0.96)
          .setScale(baseScale * (0.96 + envelope * 0.055))
      },
      onComplete: () => {
        glow.setAlpha(0).setScale(baseScale).setVisible(false)
      },
    })
  }

  updateStars(time) {
    const baseScale = this.coverScale

    this.starSprites.forEach((star) => {
      const slowPulse = (Math.sin(time * star.speed + star.phase) + 1) / 2
      const quickPulse =
        (Math.sin(time * star.speed * 2.37 + star.phase * 0.71) + 1) / 2
      const twinkle = Math.pow(slowPulse * 0.72 + quickPulse * 0.28, 1.45)
      const pulseScale =
        baseScale * (0.94 + twinkle * (0.05 + star.intensity * 0.07))

      star.sprite
        .setScale(pulseScale)
        .setAlpha(0.3 + star.intensity * 0.18 + twinkle * 0.42)
        .setRotation(
          Math.sin(time * star.speed * 0.38 + star.phase) *
            0.035 *
            star.intensity,
        )

      if (star.glow) {
        star.glow.outerStrength =
          0.5 + twinkle * (0.8 + star.intensity * 1.2)
        star.glow.scale = 0.65 + twinkle * 0.25
      }
    })
  }

  update(time) {
    if (!this.viewportCenter) return

    const { x: centerX, y: centerY } = this.viewportCenter
    const scale = this.coverScale

    this.updateStars(time)

    if (this.hasWaterShader) {
      // 30 FPS güncellenen küçük displacement haritası, tam ekran denizden
      // çok daha az maliyetle gerçek zamanlı dalga kırılması üretir.
      if (time - this.lastWaterMapUpdate >= 33) {
        this.renderWaterMap(time)
        this.lastWaterMapUpdate = time
      }

      this.waterDisplacement.x = 0.032 + Math.sin(time * 0.0007) * 0.007
      this.waterDisplacement.y = 0.016 + Math.cos(time * 0.00055) * 0.004
      return
    }

    // WebGL bulunmayan cihazlarda animasyon tamamen kaybolmasın.
    this.backgroundLayers.sea.setPosition(
      centerX + Math.sin(time * 0.0007) * 12 * scale,
      centerY + Math.cos(time * 0.00055) * 3 * scale,
    )
  }
}

watch(
  [() => props.engine.round.value, () => props.engine.finished.value, gridSize, roundWords],
  ([round, finished]) => {
    if (round <= 0 || finished) return
    if (answerTimer) window.clearTimeout(answerTimer)
    if (hintTimer) window.clearTimeout(hintTimer)
    answerTimer = null
    hintTimer = null
    answerLocked = false
    hintBusy.value = false
    remainingHints.value = hintCount.value
    usedHints.value = 0
    roundScore.value = 0
    roundStartedAt = performance.now()
    pendingRound = { size: gridSize.value, words: [...roundWords.value], seed: round }
    game?.scene.getScene('BackgroundScene')?.startRound(pendingRound.size, pendingRound.words, pendingRound.seed)
  },
  { immediate: true },
)

watch(hintCount, (value) => {
  remainingHints.value = value
})

watch([liveTextScale, liveDurationScale], ([textScale, durationScale]) => {
  game?.scene.getScene('BackgroundScene')?.applyLiveSettings(textScale, durationScale)
})

onMounted(() => {
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameContainer.value,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#102b78',
    scene: BackgroundScene,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoRound: true,
    },
    render: {
      antialias: true,
      antialiasGL: true,
      roundPixels: true,
      mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
      transparent: false,
    },
  })
})

onBeforeUnmount(() => {
  if (answerTimer) window.clearTimeout(answerTimer)
  if (hintTimer) window.clearTimeout(hintTimer)
  game?.destroy(true)
  game = null
})
</script>

<template>
  <main class="game-shell">
    <div ref="gameContainer" class="game-container" aria-label="Deniz feneri oyun arka planı" />

    <img
      v-if="wordPanel.visible && wordPanel.title"
      class="game-title-overlay game-image"
      :src="gameTitleUrl"
      :style="{
        left: `${wordPanel.title.x}px`,
        top: `${wordPanel.title.y}px`,
        width: `${wordPanel.title.width}px`,
        height: `${wordPanel.title.height}px`,
      }"
      alt="Fener Bulmaca"
    >

    <section
      v-if="wordPanel.visible"
      class="word-panel-overlay"
      :style="{
        left: `${wordPanel.x}px`,
        top: `${wordPanel.y}px`,
        width: `${wordPanel.width}px`,
        height: `${wordPanel.height}px`,
        '--panel-width': `${wordPanel.width}px`,
        '--panel-height': `${wordPanel.height}px`,
        '--panel-star-size': `${wordPanel.starSize}px`,
        '--panel-title-font-size': scaledPanelFont(wordPanel.width * 0.0628, 11, 30),
        '--panel-score-font-size': scaledPanelFont(wordPanel.width * 0.0535, 11, 25),
        '--panel-item-font-size': scaledPanelFont(wordPanel.height * 0.029, 10, 21),
        '--panel-hint-font-size': scaledPanelFont(wordPanel.height * 0.0225, 9, 18),
        '--star-arrive-duration': `${Math.round(360 * liveDurationScale)}ms`,
        '--word-found-duration': `${Math.round(480 * liveDurationScale)}ms`,
        '--check-arrive-duration': `${Math.round(520 * liveDurationScale)}ms`,
      }"
      aria-label="Aranacak kelimeler"
    >
      <h2 class="game-scale-text">ARANACAK KELİMELER</h2>
      <div class="word-panel-divider" aria-hidden="true">
        <span />
        <i />
        <span />
      </div>

      <div class="word-panel-score">
        <img
          :key="wordPanel.starPulse"
          :class="{ 'is-pulsing': wordPanel.starPulse > 0 }"
          :src="starIconUrl"
          alt=""
        >
        <strong class="game-scale-text">{{ roundScore }} puan</strong>
        <button
          class="word-panel-hint-button game-cta jelly-tap game-scale-text"
          type="button"
          title="İpucu kullan"
          aria-label="İpucu kullan"
          :disabled="hintBusy || remainingHints <= 0 || roundComplete"
          @click="useHint"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M9 18h6M10 21h4" />
            <path d="M8.4 14.6c-1.3-1-2.1-2.6-2.1-4.4a5.7 5.7 0 0 1 11.4 0c0 1.8-.8 3.4-2.1 4.4-.7.6-1 1.1-1.1 1.7h-5c-.1-.6-.4-1.1-1.1-1.7Z" />
            <path d="M12 2V.8M4.8 3l1 1M19.2 3l-1 1M2.7 10.2H1.3M22.7 10.2h-1.4" />
          </svg>
        </button>
        <span class="word-panel-hint-count game-scale-text">{{ usedHints }} / {{ hintCount }}</span>
      </div>

      <div
        class="word-panel-list"
        :class="{
          'two-columns': wordPanel.columns === 2,
          'five-words': wordPanel.total === 5,
        }"
        :style="{
          gridTemplateColumns: `repeat(${wordPanel.columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${wordPanel.rowsPerColumn}, minmax(0, 1fr))`,
        }"
      >
        <div
          v-for="(word, wordIndex) in wordPanel.words"
          :key="word"
          class="word-panel-item game-scale-text"
          :class="{
            found: wordPanel.foundWords.includes(word),
            'left-column': wordPanel.columns === 2 && wordIndex < wordPanel.rowsPerColumn,
          }"
        >
          <span class="word-panel-status" aria-hidden="true">{{ wordPanel.foundWords.includes(word) ? '✓' : '' }}</span>
          <span class="word-panel-label">{{ word }}</span>
        </div>
      </div>

      <div class="word-panel-hint game-scale-text" aria-live="polite">
        <span v-if="wordPanel.selectionActive" class="word-panel-instruction">
          Komşu harfleri seç, kelimeyi oluştur!<br>
          <small>Düz çizgi gerekmez.</small>
        </span>
        <span v-else class="word-panel-instruction">
          Feneri yak ve kelime avına başla!
        </span>
      </div>
    </section>
  </main>
</template>
<style>
.game-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background: #081638;
  touch-action: manipulation;
}

.game-container {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.game-container canvas {
  display: block;
}

.game-title-overlay {
  position: absolute;
  z-index: 30;
  display: block;
  pointer-events: none;
  object-fit: contain;
  image-rendering: auto;
}

.word-panel-overlay {
  --panel-star-size: 48px;
  position: absolute;
  z-index: 30;
  pointer-events: none;
  color: var(--koak-navy, #082a57);
  font-family: "Trebuchet MS", "Segoe UI", Arial, sans-serif;
  font-synthesis: none;
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: antialiased;
}

.word-panel-overlay h2 {
  position: absolute;
  top: 15.3%;
  left: 6%;
  width: 88%;
  margin: 0;
  color: #4c230f;
  font-size: var(--panel-title-font-size, 24px);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.01em;
  text-align: center;
  white-space: nowrap;
}

.word-panel-divider {
  position: absolute;
  top: 21.1%;
  left: 16%;
  display: grid;
  grid-template-columns: 1fr 8px 1fr;
  align-items: center;
  gap: 7.5%;
  width: 68%;
  height: 8px;
}

.word-panel-divider span {
  height: 2px;
  border-radius: 999px;
  background: #b56b2d;
  opacity: 0.72;
}

.word-panel-divider i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c47a35;
}

.word-panel-score {
  position: absolute;
  top: 23.6%;
  left: 17%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.28em;
  width: 66%;
  height: 7.4%;
}

.word-panel-score img {
  width: var(--panel-star-size);
  height: var(--panel-star-size);
  object-fit: contain;
  image-rendering: auto;
  transform-origin: 50% 50%;
}

.word-panel-score img.is-pulsing {
  animation: panel-star-arrive var(--star-arrive-duration, 360ms) cubic-bezier(0.18, 0.89, 0.32, 1.35);
}

.word-panel-score strong {
  color: var(--koak-text, #542813);
  font-size: var(--panel-score-font-size, 21px);
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.word-panel-hint-count {
  color: #8f5928;
  font-size: calc(var(--panel-score-font-size, 21px) * 0.78);
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

.word-panel-list {
  position: absolute;
  top: 33.5%;
  left: 16%;
  display: grid;
  grid-auto-flow: column;
  column-gap: 4%;
  row-gap: 1.6%;
  width: 68%;
  height: 44.5%;
}

.word-panel-list.two-columns {
  left: 12.5%;
  width: 75%;
}

.word-panel-list.five-words {
  left: 20%;
  width: 60%;
}

.word-panel-item {
  box-sizing: border-box;
  display: flex;
  width: max-content;
  max-width: 100%;
  min-width: 132px;
  align-self: center;
  align-items: center;
  justify-self: start;
  gap: 0.28em;
  overflow: hidden;
  padding: 0.42em 0.72em;
  border-radius: 0.55em;
  color: var(--koak-navy, #082a57);
  background: rgb(244 213 162 / 23%);
  font-size: var(--panel-item-font-size, 18px);
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.01em;
  white-space: nowrap;
  transition: color 360ms ease, background-color 360ms ease;
}

.word-panel-list.two-columns .word-panel-item {
  width: 88%;
  min-width: 0;
}

.word-panel-list.two-columns .word-panel-item.left-column {
  width: calc(88% - 0.85em);
  margin-left: 0.85em;
}

.word-panel-list.five-words .word-panel-item {
  width: 100%;
  min-width: 0;
  gap: 0.62em;
  padding-right: 0.75em;
  padding-left: 0.78em;
}

.word-panel-label {
  -webkit-text-stroke: 0.2px currentColor;
}

.word-panel-status {
  box-sizing: border-box;
  display: flex;
  flex: 0 0 1.62em;
  align-items: center;
  justify-content: center;
  width: 1.62em;
  height: 1.62em;
  border: 0.1em solid rgb(166 105 48 / 70%);
  border-radius: 50%;
  color: transparent;
  font-size: 1em;
  font-weight: 800;
  line-height: 1;
  text-align: center;
  transition: color 260ms ease, background-color 260ms ease, border-color 260ms ease;
}

.word-panel-item.found {
  color: #315f27;
  background: rgb(190 222 151 / 38%);
  animation: word-found-settle var(--word-found-duration, 480ms) cubic-bezier(0.2, 0.85, 0.3, 1.25);
}

.word-panel-item.found .word-panel-status {
  border-color: #2fbd45;
  color: #fff;
  background: #38c64c;
  box-shadow: 0 2px 4px rgb(30 132 48 / 24%);
  animation: word-check-arrive var(--check-arrive-duration, 520ms) cubic-bezier(0.18, 0.89, 0.32, 1.35);
}

.word-panel-hint {
  position: absolute;
  top: 78.5%;
  left: 11%;
  display: flex;
  width: 78%;
  height: 14.5%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.28em;
  color: #674426;
  font-size: var(--panel-hint-font-size, 15px);
  font-weight: 600;
  line-height: 1.18;
  text-align: center;
}

.word-panel-instruction {
  box-sizing: border-box;
  display: block;
  width: 100%;
  max-width: 100%;
  padding: 0 0.35em;
  overflow-wrap: anywhere;
  line-height: 1.22;
  white-space: normal !important;
}

.word-panel-instruction small {
  font: inherit;
  font-size: 0.92em;
  font-weight: 700;
}

.word-panel-hint-button {
  position: relative;
  display: inline-flex;
  width: 44px;
  min-width: 44px;
  height: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  margin-left: 0.45em;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #9a5c1d;
  background: transparent;
  box-shadow: none;
  font: inherit;
  font-size: 1.45em;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  pointer-events: auto;
  transition: transform 150ms ease, opacity 150ms ease, background-color 150ms ease;
}

.word-panel-hint-button::before {
  position: absolute;
  inset: 2px;
  border: 2px solid #c8893f;
  border-radius: 50%;
  background: linear-gradient(180deg, #fff4c9 0%, #ffd979 100%);
  box-shadow: 0 3px 0 #9d5c25, 0 4px 8px rgb(102 55 17 / 24%);
  content: "";
  transition: transform 150ms ease, box-shadow 150ms ease, background 150ms ease;
}

.word-panel-hint-button svg {
  position: relative;
  z-index: 1;
  width: 23px;
  height: 23px;
  overflow: visible;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.word-panel-hint-button:hover:not(:disabled) {
  background: transparent;
}

.word-panel-hint-button:hover:not(:disabled)::before {
  background: linear-gradient(180deg, #fff8d9 0%, #ffe18a 100%);
  transform: translateY(-1px) scale(1.04);
}

.word-panel-hint-button:active:not(:disabled) {
  box-shadow: none;
  transform: none;
}

.word-panel-hint-button:active:not(:disabled)::before {
  box-shadow: 0 1px 0 #9d5c25, 0 2px 5px rgb(102 55 17 / 20%);
  transform: translateY(2px) scale(0.98);
}

.word-panel-hint-button:focus-visible {
  outline: 3px solid var(--koak-focus, #57bde8);
  outline-offset: 2px;
}

.word-panel-hint-button:disabled {
  cursor: default;
  opacity: 0.5;
}

@media (max-width: 600px) {
  .word-panel-hint {
    left: 8%;
    width: 84%;
    font-size: max(10px, var(--panel-hint-font-size, 12px));
  }

  .word-panel-instruction {
    line-height: 1.08;
  }

  .word-panel-hint-button {
    margin-left: 0.2em;
  }
}

@keyframes panel-star-arrive {
  0% { transform: scale(1); }
  45% { transform: scale(1.28) rotate(-8deg); }
  72% { transform: scale(0.93) rotate(4deg); }
  100% { transform: scale(1) rotate(0); }
}

@keyframes word-found-settle {
  0% { transform: scale(1); }
  42% { transform: scale(1.08); }
  72% { transform: scale(0.97); }
  100% { transform: scale(1); }
}

@keyframes word-check-arrive {
  0% { opacity: 0; transform: scale(0.2) rotate(-20deg); }
  55% { opacity: 1; transform: scale(1.32) rotate(7deg); }
  78% { transform: scale(0.9) rotate(-3deg); }
  100% { opacity: 1; transform: scale(1) rotate(0); }
}
</style>

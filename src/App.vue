<script setup>
import { computed, provide, reactive, ref } from 'vue'
import FenerBulmaca from './FenerBulmaca.vue'

const queryGrid = Number(new URLSearchParams(window.location.search).get('grid'))
const gridSize = [8, 10, 12, 14].includes(queryGrid) ? queryGrid : 8

const round = ref(1)
const total = ref(3)
const correct = ref(0)
const points = ref(0)
const finished = computed(() => round.value > total.value)
const score = computed(() => points.value)

const engine = {
  round,
  total,
  correct,
  points,
  score,
  finished,
  answer(isCorrect, meta = {}, pts = 1) {
    if (finished.value) return
    if (isCorrect) {
      correct.value += 1
      points.value += Number(pts) || 0
    }
    console.info('Fener Bulmaca tur cevabı:', { isCorrect, meta, pts })
    round.value += 1
  },
  complete(meta = {}) {
    if (finished.value) return
    console.info('Fener Bulmaca tamamlandı:', meta)
    round.value = total.value + 1
  },
}

const params = reactive({
  level: 'kolay',
  gridSize,
  rounds: total.value,
  hintCount: 3,
})

const liveSettings = reactive({ sizeScale: 1, elementCount: null, speed: 100 })
provide('liveSettings', liveSettings)
</script>

<template>
  <FenerBulmaca :engine="engine" :params="params" :pool="null" />
</template>

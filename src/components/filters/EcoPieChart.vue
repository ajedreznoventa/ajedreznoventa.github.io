<script setup lang="ts">
import { computed } from "vue";
import { useOpeningsStore } from "@/stores/openingsStore";
import { Opening } from "@/model/Opening";

const props = defineProps({
  videos: {
    type: Array,
    default: () => []
  }
})

const openingsStore = useOpeningsStore()

// Define colors for ECO volumes A through E
const ecoCategories = [
  { code: 'A', label: 'A (Flank & Unorthodox)', color: '#4e73df' },
  { code: 'B', label: 'B (Semi-Open / Sicilian)', color: '#1cc88a' },
  { code: 'C', label: 'C (Open Games & French)', color: '#36b9cc' },
  { code: 'D', label: 'D (Closed & Semi-Closed)', color: '#f6c23e' },
  { code: 'E', label: 'E (Indian Defenses)', color: '#e74a3b' }
]

// Compute counts for each category using openingsStore
const ecoCounts = computed(() => {
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 }
  
  if (!props.videos) return counts

  props.videos.forEach((video: any) => {
    const games = video.games || []
    
    // Process each game in the video
    games.forEach((game: any, gameIdx: number) => {
      const openings = openingsStore.getOpeningsForVideoGame(video.id, gameIdx) || []
      const openingName = openings.map((o: Opening) => o.name)[0] || ""
      
      // Extract ECO letter (A, B, C, D, or E) from beginning of opening name
      const firstLetter = openingName.trim().charAt(0).toUpperCase()
      
      if (counts[firstLetter] !== undefined) {
        counts[firstLetter]++
      }
    })
  })
  
  return counts
})

const total = computed(() => {
  return Object.values(ecoCounts.value).reduce((acc, curr) => acc + curr, 0)
})

// Calculate SVG pie slices path geometries
const slices = computed(() => {
  if (total.value === 0) return []

  let accumulatedAngle = 0
  return ecoCategories.map((cat) => {
    const count = ecoCounts.value[cat.code]
    const percentage = count / total.value
    const angle = percentage * 360

    const startAngle = accumulatedAngle
    const endAngle = accumulatedAngle + angle
    accumulatedAngle += angle

    // Convert polar angles to x, y SVG coordinates
    const startRad = (startAngle - 90) * (Math.PI / 180)
    const endRad = (endAngle - 90) * (Math.PI / 180)

    const x1 = 100 + 80 * Math.cos(startRad)
    const y1 = 100 + 80 * Math.sin(startRad)
    const x2 = 100 + 80 * Math.cos(endRad)
    const y2 = 100 + 80 * Math.sin(endRad)

    const largeArcFlag = angle > 180 ? 1 : 0

    // SVG arc path
    const pathData = percentage === 1
      ? `M 100 20 A 80 80 0 1 1 99.99 20 Z`
      : `M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArcFlag} 1 ${x2} ${y2} Z`

    return {
      ...cat,
      count,
      percentage: Math.round(percentage * 100),
      pathData
    }
  })
})
</script>

<template>
  <div class="d-flex flex-column align-items-center w-100 p-2">
    <h6 class="text-center text-muted mb-3">Opening Distribution (ECO AâE)</h6>

    <div v-if="total === 0" class="text-center text-secondary my-4">
      No opening data available
    </div>

    <div v-else class="d-flex flex-column flex-xl-row align-items-center justify-content-center gap-3 w-100">
      <!-- SVG Pie Chart -->
      <svg viewBox="0 0 200 200" width="160" height="160" style="overflow: visible;">
        <g v-for="slice in slices" :key="slice.code">
          <path
            v-if="slice.count > 0"
            :d="slice.pathData"
            :fill="slice.color"
            stroke="#ffffff"
            stroke-width="1.5"
          >
            <title>{{ slice.label }}: {{ slice.count }} ({{ slice.percentage }}%)</title>
          </path>
        </g>
      </svg>

      <!-- Chart Legend -->
      <div class="legend text-start">
        <div v-for="cat in ecoCategories" :key="cat.code" class="d-flex align-items-center gap-2 mb-1 small">
          <span
            class="d-inline-block rounded-circle"
            :style="{ backgroundColor: cat.color, width: '10px', height: '10px' }"
          ></span>
          <span><strong>{{ cat.code }}</strong>: {{ ecoCounts[cat.code] }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
path {
  transition: opacity 0.2s ease-in-out;
  cursor: pointer;
}
path:hover {
  opacity: 0.85;
}
</style>

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

// Define colors and full labels for ECO volumes A through E
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

// Calculate SVG pie slices path geometries (Center: 100, 100 | Radius: 95 for maximum size)
const slices = computed(() => {
  if (total.value === 0) return []

  let accumulatedAngle = 0
  const radius = 95
  const cx = 100
  const cy = 100

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

    const x1 = cx + radius * Math.cos(startRad)
    const y1 = cy + radius * Math.sin(startRad)
    const x2 = cx + radius * Math.cos(endRad)
    const y2 = cy + radius * Math.sin(endRad)

    const largeArcFlag = angle > 180 ? 1 : 0

    // SVG arc path
    const pathData = percentage === 1
      ? `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} Z`
      : `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`

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
  <div class="d-flex flex-column align-items-center w-100 h-100 p-0">
    <!-- Simplified Title -->
    <h6 class="text-center text-muted mt-1 mb-1 fw-bold">Opening Distribution</h6>

    <div v-if="total === 0" class="text-center text-secondary my-auto">
      No opening data available
    </div>

    <div v-else class="d-flex flex-column align-items-center justify-content-between w-100 h-100">
      <!-- TOP 2/3: SVG Pie Chart (Maximized Sizing) -->
      <div class="chart-container d-flex align-items-center justify-content-center w-100 flex-grow-1">
        <!-- Tight viewBox (5 5 190 190) clips out all extra margin -->
        <svg viewBox="5 5 190 190" class="pie-svg">
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
      </div>

      <!-- BOTTOM 1/3: Legend -->
      <div class="legend-container d-flex flex-column justify-content-center w-100 pt-2 border-top flex-shrink-0">
        <div v-for="cat in ecoCategories" :key="cat.code" class="d-flex align-items-center justify-content-between mb-1 small px-3">
          <div class="d-flex align-items-center gap-2">
            <span
              class="d-inline-block rounded-circle"
              :style="{ backgroundColor: cat.color, width: '10px', height: '10px', flexShrink: 0 }"
            ></span>
            <span>{{ cat.label }}</span>
          </div>
          <strong>{{ ecoCounts[cat.code] }}</strong>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-container {
  height: 66.66%;
  width: 100%;
}

/* Scaled up maximum dimensions */
.pie-svg {
  width: 100%;
  height: 100%;
  max-height: 320px;
  object-fit: contain;
}

.legend-container {
  height: 33.33%;
}

path {
  transition: opacity 0.2s ease-in-out;
  cursor: pointer;
}
path:hover {
  opacity: 0.85;
}
</style>

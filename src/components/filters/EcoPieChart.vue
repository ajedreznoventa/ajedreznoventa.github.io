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

// Calculate SVG pie slices path geometries and label positions
const slices = computed(() => {
  if (total.value === 0) return []

  let accumulatedAngle = 0
  const radius = 95
  const labelRadius = 60 // Distance from center to place the letter label
  const cx = 100
  const cy = 100

  return ecoCategories.map((cat) => {
    const count = ecoCounts.value[cat.code]
    const rawPercentage = total.value > 0 ? (count / total.value) : 0
    const angle = rawPercentage * 360

    const startAngle = accumulatedAngle
    const endAngle = accumulatedAngle + angle
    accumulatedAngle += angle

    // Mid-angle for positioning text label in slice centroid
    const midAngle = startAngle + angle / 2
    const midRad = (midAngle - 90) * (Math.PI / 180)

    const labelX = cx + labelRadius * Math.cos(midRad)
    const labelY = cy + labelRadius * Math.sin(midRad)

    // Convert polar angles to x, y SVG coordinates
    const startRad = (startAngle - 90) * (Math.PI / 180)
    const endRad = (endAngle - 90) * (Math.PI / 180)

    const x1 = cx + radius * Math.cos(startRad)
    const y1 = cy + radius * Math.sin(startRad)
    const x2 = cx + radius * Math.cos(endRad)
    const y2 = cy + radius * Math.sin(endRad)

    const largeArcFlag = angle > 180 ? 1 : 0

    // SVG arc path
    const pathData = rawPercentage === 1
      ? `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} Z`
      : `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`

    return {
      ...cat,
      count,
      percentage: Math.round(rawPercentage * 100),
      rawPercentage,
      pathData,
      labelX,
      labelY
    }
  })
})

function getPercentage(count: number): number {
  if (total.value === 0) return 0
  return Math.round((count / total.value) * 100)
}
</script>

<template>
  <div class="d-flex flex-column align-items-center w-100 h-100 p-0">
    <!-- Simplified Title -->
    <h6 class="text-center text-muted mt-1 mb-2 fw-bold">Opening Distribution</h6>

    <div v-if="total === 0" class="text-center text-secondary my-auto">
      No opening data available
    </div>

    <div v-else class="d-flex flex-column align-items-center justify-content-between w-100 flex-grow-1">
      <!-- TOP: Maximized SVG Pie Chart with Inner Labels -->
      <div class="chart-container d-flex align-items-center justify-content-center w-100 flex-grow-1 my-1">
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
            
            <!-- In-Slice Label Text (14px matches fs-6 in legend) -->
            <text
              v-if="slice.count > 0 && slice.rawPercentage > 0.03"
              :x="slice.labelX"
              :y="slice.labelY"
              text-anchor="middle"
              dominant-baseline="central"
              class="slice-label"
            >
              {{ slice.code }}
            </text>
          </g>
        </svg>
      </div>

      <!-- BOTTOM: Compact Legend -->
      <div class="legend-container d-flex flex-column justify-content-end w-100 pt-2 border-top flex-shrink-0">
        <div v-for="cat in ecoCategories" :key="cat.code" class="d-flex align-items-center justify-content-between mb-1 fs-6 px-3">
          <div class="d-flex align-items-center gap-2">
            <span
              class="d-inline-block rounded-circle"
              :style="{ backgroundColor: cat.color, width: '12px', height: '12px', flexShrink: 0 }"
            ></span>
            <span>{{ cat.label }}</span>
          </div>
          <span class="text-nowrap ms-2">
            {{ ecoCounts[cat.code] }} ({{ getPercentage(ecoCounts[cat.code]) }}%)
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-container {
  width: 100%;
  min-height: 200px;
}

.pie-svg {
  width: 100%;
  height: 100%;
  max-height: 380px;
  object-fit: contain;
}

.legend-container {
  height: auto;
}

/* Updated font-size to 14px to match Bootstrap's .fs-6 */
.slice-label {
  fill: #ffffff;
  font-size: 14px;
  font-weight: 500;
  pointer-events: none;
  filter: drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.4));
}

path {
  transition: opacity 0.2s ease-in-out;
  cursor: pointer;
}
path:hover {
  opacity: 0.85;
}
</style>

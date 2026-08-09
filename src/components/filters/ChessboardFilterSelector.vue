<script setup lang="ts">
// @ts-ignore Import module
import {Chess} from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0-beta.3/+esm'
import {onMounted, ref, watch} from "vue";
import {RemoveVideoFilterEvent} from "@/event/RemovedVideoFilterEvent";
import {VideoFilter} from "@/model/VideoFilter";
import {PgnFilter} from "@/filter/PgnFilter";
import {ReplaceVideoFilterEvent} from "@/event/ReplaceVideoFilterEvent";
import {usePgnsStore} from "@/stores/pgnsStore";

interface CandidateMove {
  san: string;
  count: number;
}

const emits = defineEmits(['replaceFilter', 'removeFilter'])

const props = defineProps({
  filters: Array<VideoFilter>,
  videos: {
    type: Array,
    default: () => []
  }
})

const pgnsStore = usePgnsStore()
const transpositionChecked = ref<boolean>(true)
const fenInput = ref<string>('')
const fenError = ref<boolean>(false)
const nextMoves = ref<CandidateMove[]>([])

// Watch props.videos and pgnsStore state to update moves as data finishes fetching
watch(() => props.videos, () => calculateNextMoves(), { deep: true })
watch(() => pgnsStore.pgns.size, () => calculateNextMoves())

watch(props.filters, (filters) => {
    if (game && game.pgn()) {
      if (!filters.find((vf: VideoFilter) => vf instanceof PgnFilter)) {
        game.reset()
        board.position(game.fen())
        fenInput.value = ''
        fenError.value = false
        calculateNextMoves()
      }
    }
})

let game: any = null
let board: any = null

function calculateNextMoves() {
  if (!game) return

  const currentHistory = game.history()
  const currentPlyCount = currentHistory.length
  const moveCounts: Record<string, number> = {}

  const videoList = props.videos || []

  videoList.forEach((video: any) => {
    // Retrieve Pgn array from store for this video ID
    const videoPgns = pgnsStore.getPgnsForVideo(video.id) || []

    videoPgns.forEach((pgnObj: any) => {
      // Get raw string from Pgn model instance
      const rawPgn = typeof pgnObj === 'string' ? pgnObj : (pgnObj.pgn || pgnObj.rawPgn || '')
      if (!rawPgn) return

      try {
        const tempGame = new Chess()
        tempGame.loadPgn(rawPgn)
        const gameHistory = tempGame.history()

        // Check if game matches board's current move history up to current depth
        let isMatch = true
        for (let i = 0; i < currentPlyCount; i++) {
          if (gameHistory[i] !== currentHistory[i]) {
            isMatch = false
            break
          }
        }

        if (isMatch && gameHistory[currentPlyCount]) {
          const nextSan = gameHistory[currentPlyCount]
          moveCounts[nextSan] = (moveCounts[nextSan] || 0) + 1
        }
      } catch (e) {
        // Ignore unparseable PGN strings
      }
    })
  })

  // Format into sorted candidate list
  nextMoves.value = Object.keys(moveCounts)
    .map(san => ({ san, count: moveCounts[san] }))
    .sort((a, b) => b.count - a.count)
}

function playCandidateMove(san: string) {
  try {
    game.move(san)
    board.position(game.fen())
    fenInput.value = game.fen()
    fenError.value = false
    calculateNextMoves()
    onPgnChanged()
  } catch (e) {
    console.error("Failed to play candidate move:", e)
  }
}

function onBackOneStep() {
  game.undo()
  board.position(game.fen())
  fenInput.value = game.fen()
  fenError.value = false
  calculateNextMoves()
  onPgnChanged()
}

function onPgnChanged() {
  if (!game.pgn()) {
    emits('removeFilter', new RemoveVideoFilterEvent((vf: VideoFilter) => vf instanceof PgnFilter))
  } else {
    emits('replaceFilter', new ReplaceVideoFilterEvent(
        (vf: VideoFilter) => vf instanceof PgnFilter,
        new PgnFilter(game.pgn(), game.fen(), transpositionChecked.value)
    ))
  }
}

function onLoadFen() {
  const trimmedFen = fenInput.value.trim()
  if (!trimmedFen) return

  try {
    game.load(trimmedFen)
    board.position(game.fen())
    fenError.value = false
    calculateNextMoves()
    onPgnChanged()
  } catch (e) {
    fenError.value = true
  }
}

function onDragStart(source: any, piece: any) {
  let scrollTop = window.pageYOffset || document.documentElement.scrollTop
  let scrollLeft = window.pageXOffset || document.documentElement.scrollLeft

  window.onscroll = function () {
    window.scrollTo(scrollLeft, scrollTop);
  };

  setTimeout(function () {
    window.onscroll = function () {
    }
  }, 3000)

  if (game.isGameOver()) return false

  if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
      (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
    return false
  }
}

function onDrop(source: any, target: any) {
  window.onscroll = function () {
  }

  try {
    game.move({
      from: source,
      to: target,
      promotion: 'q'
    })

    fenInput.value = game.fen()
    fenError.value = false
    calculateNextMoves()
    onPgnChanged()

    setTimeout(function () {
      board.position(game.fen())
    }, 1)
  } catch (e) {
    return 'snapback'
  }
}

onMounted(() => {
  game = new Chess()

  const config = {
    draggable: true,
    position: 'start',
    dropOffBoard: 'snapback',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapbackEnd: () => window.onscroll = function () {
    },
    onMoveEnd: () => window.onscroll = function () {
    }
  }

  // @ts-ignore
  board = Chessboard('boardFilter', config)

  calculateNextMoves()

  setTimeout(() => {
    window.dispatchEvent(new Event('resize'))
  }, 50)
})

</script>

<template>
  <div class="d-flex flex-column gap-3">
    <div class="d-flex flex-row align-items-start gap-3">
      <!-- Chessboard Container -->
      <div style="width: 350px; max-width: 100%;">
        <div id="boardFilter" style="width: 100%;"></div>
      </div>

      <!-- Next Available Moves Column -->
      <div class="d-flex flex-column gap-2 flex-grow-1" style="max-width: 220px;">
        <span class="fw-bold small text-muted">Next Moves Available</span>
        
        <!-- Next Moves List -->
        <div 
          class="border rounded p-2 bg-light overflow-auto small" 
          style="height: 290px;"
        >
          <div v-if="nextMoves.length === 0" class="text-muted fst-italic">
            No database moves from this position
          </div>

          <div 
            v-for="candidate in nextMoves" 
            :key="candidate.san" 
            class="d-flex flex-row justify-content-between align-items-center py-1 border-bottom border-white"
          >
            <a 
              href="javascript:void(0)" 
              class="move-btn text-decoration-none fw-bold text-primary px-2 py-1 rounded flex-grow-1"
              @click="playCandidateMove(candidate.san)"
            >
              {{ candidate.san }}
            </a>
            <span class="text-muted ms-2 text-nowrap">
              ({{ candidate.count }} {{ candidate.count === 1 ? 'game' : 'games' }})
            </span>
          </div>
        </div>

        <button class="btn btn-primary btn-sm w-100 mt-1" type="button" @click="onBackOneStep">
          Back one step
        </button>
      </div>
    </div>

    <!-- FEN Input Section -->
    <div class="w-100" style="max-width: 350px;">
      <div class="input-group input-group-sm">
        <input
          type="text"
          class="form-control"
          :class="{ 'is-invalid': fenError }"
          v-model="fenInput"
          placeholder="Paste FEN position..."
          @keyup.enter="onLoadFen"
        />
        <button class="btn btn-outline-primary" type="button" @click="onLoadFen">
          Load FEN
        </button>
      </div>
      <div v-if="fenError" class="text-danger small mt-1">
        Invalid FEN position
      </div>
    </div>
  </div>
</template>

<style scoped>
.move-btn:hover {
  background-color: #e2e8f0;
}
</style>

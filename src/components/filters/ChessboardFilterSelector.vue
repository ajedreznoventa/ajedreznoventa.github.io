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

function updateFenInput() {
  // Keep input clear if at starting position so placeholder stays visible
  if (game.history().length === 0) {
    fenInput.value = ''
  } else {
    fenInput.value = game.fen()
  }
}

function normalizeFen(fen: string): string {
  // Normalize FEN by using only position, active color, castling rights, and en passant target
  return fen.split(' ').slice(0, 4).join(' ')
}

function calculateNextMoves() {
  if (!game) return

  const currentHistory = game.history()
  const currentPlyCount = currentHistory.length
  const currentBoardFen = normalizeFen(game.fen())
  
  // Track set of unique Video IDs for each next candidate move
  const moveVideoSets: Record<string, Set<string>> = {}

  const videoList = props.videos || []

  videoList.forEach((video: any) => {
    const videoPgns = pgnsStore.getPgnsForVideo(video.id) || []

    videoPgns.forEach((pgnObj: any) => {
      const rawPgn = typeof pgnObj === 'string' ? pgnObj : (pgnObj.pgn || pgnObj.rawPgn || '')
      if (!rawPgn) return

      try {
        const tempGame = new Chess()
        tempGame.loadPgn(rawPgn)

        if (transpositionChecked.value) {
          // Transposition Logic: Step through the moves to match board FEN
          const moves = tempGame.history()
          const runner = new Chess()
          
          if (normalizeFen(runner.fen()) === currentBoardFen) {
            if (moves.length > 0) {
              const nextSan = moves[0]
              if (!moveVideoSets[nextSan]) moveVideoSets[nextSan] = new Set()
              moveVideoSets[nextSan].add(video.id)
            }
          } else {
            for (let i = 0; i < moves.length; i++) {
              runner.move(moves[i])
              if (normalizeFen(runner.fen()) === currentBoardFen) {
                if (i + 1 < moves.length) {
                  const nextSan = moves[i + 1]
                  if (!moveVideoSets[nextSan]) moveVideoSets[nextSan] = new Set()
                  moveVideoSets[nextSan].add(video.id)
                }
                break
              }
            }
          }
        } else {
          // Strict Move Order Logic: Match exact move sequence ply by ply
          const gameHistory = tempGame.history()
          let isMatch = true
          for (let i = 0; i < currentPlyCount; i++) {
            if (gameHistory[i] !== currentHistory[i]) {
              isMatch = false
              break
            }
          }

          if (isMatch && gameHistory[currentPlyCount]) {
            const nextSan = gameHistory[currentPlyCount]
            if (!moveVideoSets[nextSan]) moveVideoSets[nextSan] = new Set()
            moveVideoSets[nextSan].add(video.id)
          }
        }
      } catch (e) {
        // Ignore unparseable PGN strings
      }
    })
  })

  nextMoves.value = Object.keys(moveVideoSets)
    .map(san => ({ san, count: moveVideoSets[san].size }))
    .sort((a, b) => b.count - a.count)
}

function playCandidateMove(san: string) {
  try {
    game.move(san)
    board.position(game.fen())
    updateFenInput()
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
  updateFenInput()
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

    updateFenInput()
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
    <!-- Board & Move List Row -->
    <div class="d-flex flex-row align-items-start gap-3">
      <!-- Chessboard Container -->
      <div style="width: 350px; max-width: 100%;">
        <div id="boardFilter" style="width: 100%;"></div>
      </div>

      <!-- Moves Column matching 350px board height -->
      <div class="flex-grow-1" style="max-width: 220px; height: 350px;">
        <div 
          class="border rounded p-2 bg-light overflow-auto small w-100 h-100"
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
              ({{ candidate.count }} {{ candidate.count === 1 ? 'video' : 'videos' }})
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- FEN Input & 'Back One Move' Control Row (Y-axis aligned) -->
    <div class="d-flex flex-row gap-3">
      <!-- Load FEN Input -->
      <div style="width: 350px; max-width: 100%;">
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

      <!-- Back One Move Button (X-axis aligned with Moves Column) -->
      <div class="flex-grow-1" style="max-width: 220px;">
        <button class="btn btn-primary btn-sm w-100" type="button" @click="onBackOneStep">
          Back one move
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.move-btn:hover {
  background-color: #e2e8f0;
}

/* Mobile-only responsive styles (< 768px) */
@media (max-width: 767.98px) {
  /* Stack board and moves list vertically */
  .d-flex.flex-row.align-items-start.gap-3 {
    flex-direction: column !important;
    align-items: stretch !important;
  }

  /* Allow board to expand to full mobile screen width */
  div[style*="width: 350px"] {
    width: 100% !important;
  }

  /* Expand moves list panel to full width */
  .flex-grow-1[style*="max-width: 220px"] {
    max-width: 100% !important;
    height: 200px !important;
  }

  /* Stack lower controls row vertically */
  .d-flex.flex-row.gap-3:last-child {
    flex-direction: column !important;
  }
}
</style>

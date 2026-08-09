<script setup lang="ts">
// @ts-ignore Import module
import {Chess} from 'https://cdn.jsdelivr.net/npm/chess.js@1.0.0-beta.3/+esm'
import {onMounted, ref, watch} from "vue";
import {RemoveVideoFilterEvent} from "@/event/RemovedVideoFilterEvent";
import {VideoFilter} from "@/model/VideoFilter";
import {PgnFilter} from "@/filter/PgnFilter";
import {ReplaceVideoFilterEvent} from "@/event/ReplaceVideoFilterEvent";

const emits = defineEmits(['replaceFilter', 'removeFilter'])

const props = defineProps({
  filters: Array<VideoFilter>
})

const transpositionChecked = ref<boolean>(true)
const fenInput = ref<string>('')
const fenError = ref<boolean>(false)

watch(props.filters, (filters) => {
    if (game && game.pgn()) {
      if (!filters.find((vf: VideoFilter) => vf instanceof PgnFilter)) {
        game.reset()
        board.position(game.fen())
        fenInput.value = ''
        fenError.value = false
      }
    }
})

let game: any = null
let board: any = null

function onBackOneStep() {
  game.undo()
  board.position(game.fen())
  fenInput.value = game.fen()
  fenError.value = false
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
    // Attempt to load FEN into chess.js instance
    game.load(trimmedFen)
    board.position(game.fen())
    fenError.value = false
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

  // only pick up pieces for the side to move
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
    onPgnChanged()

    setTimeout(function () {
      // hack for wrong display of white O-O
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

  // Force chessboard.js to recalculate dimensions after rendering in DOM
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'))
  }, 50)
})

</script>

<template>
  <div class="d-flex flex-column gap-3">
    <div class="d-flex flex-row align-items-center gap-3">
      <div style="width: 350px; max-width: 100%;">
        <div id="boardFilter" style="width: 100%;"></div>
      </div>
      <div>
        <a class="btn btn-primary" role="button" @click="onBackOneStep">
          Back one step
        </a>
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

</style>

<script setup lang="ts">
import PlayerFilterSelector from "@/components/filters/PlayerFilterSelector.vue";
import {AddVideoFilterEvent} from "@/event/AddVideoFilterEvent";
import {VideoFilter} from "@/model/VideoFilter";
import {FiltersModifiedEvent} from "@/event/FiltersModifiedEvent";
import MatchBetweenFilterSelector from "@/components/filters/MatchBetweenFilterSelector.vue";
import {ReplaceVideoFilterEvent} from "@/event/ReplaceVideoFilterEvent";
import {RemoveVideoFilterEvent} from "@/event/RemovedVideoFilterEvent";
import _ from "lodash";
import ChessboardFilterSelector from "@/components/filters/ChessboardFilterSelector.vue";
import EcoPieChart from "./EcoPieChart.vue";
import {ref} from "vue";

const props = defineProps({
  videos: {
    type: Array,
    default: () => []
  }
})

const filters = ref<Array<VideoFilter>>([])

const emits = defineEmits(['filtersModified'])

function onAddFilter(event: AddVideoFilterEvent) {
  filters.value.push(event.videoFilter)
  emits('filtersModified', new FiltersModifiedEvent(filters.value))
}

function onReplaceFilter(event: ReplaceVideoFilterEvent) {
  let idx = filters.value.findIndex(event.predicate)
  if (idx >= 0) {
    filters.value[idx] = event.replacementStrategy.replace(filters.value[idx], event.videoFilter)
  } else {
    filters.value.push(event.videoFilter)
  }
  emits('filtersModified', new FiltersModifiedEvent(filters.value))
}

function onRemoveFilter(event: RemoveVideoFilterEvent) {
  _.remove(filters.value, event.predicate)
  emits('filtersModified', new FiltersModifiedEvent(filters.value))
}

function onClearFiltersClicked() {
  onRemoveFilter(new RemoveVideoFilterEvent(() => true))
}

function isLarge() {
  return window.innerWidth > 1000
}

</script>

<template>
  <div class="card mt-2">
    <!-- Main Filters Header (Slightly darker grey & Collapsible arrow kept) -->
    <a class="card-header fw-bold text-decoration-none text-dark d-flex justify-content-between align-items-center" 
       style="background-color: #e2e3e5;"
       data-bs-toggle="collapse" 
       href="#filtersCard" 
       role="button" 
       aria-expanded="true" 
       aria-controls="filtersCard">
      <span>Filters</span>
      <span class="btn btn-sm py-0 px-1">&#x21D5;</span>
    </a>

    <div class="card-body p-4 collapse" :class="[isLarge() ? 'show' : '']" id="filtersCard">
      <!-- 50/50 Grid Row -->
      <div class="row g-4">
        
        <!-- LEFT 50%: Live Pie Chart -->
        <div class="col-md-6 d-flex">
          <div class="card w-100 border bg-light">
            <div class="card-body d-flex align-items-center justify-content-center">
              <EcoPieChart :videos="props.videos" />
            </div>
          </div>
        </div>

        <!-- RIGHT 50%: Stacked Filters -->
        <div class="col-md-6 d-flex flex-column gap-3">
          
          <!-- Top: Player Filters (Locked open, no collapse button) -->
          <div class="card">
            <div class="card-header fw-bold">
              Player filters
            </div>
            <div class="card-body show" id="playerFiltersCard">
              <nav>
                <div class="nav nav-tabs" id="nav-tab" role="tablist">
                  <button class="nav-link active" id="nav-single-player-tab" data-bs-toggle="tab"
                          data-bs-target="#nav-single-player" type="button" role="tab" aria-controls="nav-home"
                          aria-selected="true">Single
                  </button>
                  <button class="nav-link" id="nav-match-tab" data-bs-toggle="tab" data-bs-target="#nav-match" type="button"
                          role="tab" aria-controls="nav-profile" aria-selected="false">Match
                  </button>
                </div>
              </nav>
              <div class="tab-content ms-2 mt-1" id="nav-tabContent">
                <div class="tab-pane fade show active" id="nav-single-player" role="tabpanel"
                     aria-labelledby="nav-single-player-tab">
                  <form class="row align-items-center" action="" id="playerFilterForm">
                    <PlayerFilterSelector @addFilter="onAddFilter"></PlayerFilterSelector>
                  </form>
                </div>
                <div class="tab-pane fade" id="nav-match" role="tabpanel" aria-labelledby="nav-match-tab">
                  <form class="row" action="" id="matchFilterForm">
                    <MatchBetweenFilterSelector @addFilter="onAddFilter"></MatchBetweenFilterSelector>
                  </form>
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom: Chessboard Filter (Locked open, no collapse button) -->
          <div class="card">
            <div class="card-header fw-bold">
              Chessboard filter
            </div>
            <div class="card-body show" id="chessboardCard">
              <ChessboardFilterSelector :filters="filters"
                                        :videos="props.videos"
                                        @replaceFilter="onReplaceFilter"
                                        @removeFilter="onRemoveFilter"></ChessboardFilterSelector>
            </div>
          </div>

          <!-- Clear Filters Button -->
          <div class="d-flex justify-content-center mt-1">
            <button id="clearFilterButton" type="button" class="btn btn-primary px-4" @click="onClearFiltersClicked">
              Clear filters
            </button>
          </div>

        </div>

      </div>

    </div>
  </div>
</template>

<style scoped>
</style>

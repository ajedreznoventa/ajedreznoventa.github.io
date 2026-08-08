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
import {ref} from "vue";

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
    <div class="card-header">
      Filters
      <button class="btn btn-light float-end p-0" type="button" data-bs-toggle="collapse"
              href="#filtersCard" aria-expanded="false" aria-controls="filtersCard">
        &#x21D5;
      </button>
    </div>

    <div class="card-body p-4 collapse" :class="[isLarge() ? 'show' : '']" id="filtersCard">
      <!-- 50/50 Grid Row -->
      <div class="row g-4">
        
        <!-- LEFT 50%: Empty Reserved Space for Plot -->
        <div class="col-md-6 d-flex">
          <div class="card w-100 border-dashed bg-light">
            <div class="card-body d-flex align-items-center justify-content-center text-muted">
              <!-- Blank Space reserved for Plot -->
            </div>
          </div>
        </div>

        <!-- RIGHT 50%: Stacked Filters (Player Filters top, Chessboard bottom) -->
        <div class="col-md-6 d-flex flex-column gap-3">
          
          <!-- Top: Player Filters -->
          <div class="card">
            <div class="card-header" data-bs-toggle="collapse"
                 href="#playerFiltersCard" aria-expanded="false" aria-controls="playerFiltersCard">
              Player filters
              <button class="btn btn-light float-end p-0" type="button">
                &#x21D5;
              </button>
            </div>
            <div class="card-body collapse show" id="playerFiltersCard">
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

          <!-- Bottom: Chessboard Filter -->
          <div class="card">
            <div class="card-header" data-bs-toggle="collapse"
                 href="#chessboardCard" aria-expanded="false" aria-controls="chessboardCard">
              Chessboard filter
              <button class="btn btn-light float-end p-0" type="button">
                &#x21D5;
              </button>
            </div>
            <div class="card-body collapse show" id="chessboardCard">
              <ChessboardFilterSelector :filters=filters @replaceFilter="onReplaceFilter"
                                        @removeFilter="onRemoveFilter"></ChessboardFilterSelector>
            </div>
          </div>

        </div>

      </div>

      <!-- Clear Filters Button Centered -->
      <div class="row mt-4">
        <div class="col text-center">
          <button id="clearFilterButton" type="button" class="btn btn-primary px-4" @click="onClearFiltersClicked">
            Clear filters
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.border-dashed {
  border: 2px dashed #dee2e6;
}
</style>

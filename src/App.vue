<script setup lang="ts">
import VideoTable from './components/VideoTable.vue'
import {ref} from "vue";
import {Video} from "@/model/Video";
import {FiltersModifiedEvent} from "@/event/FiltersModifiedEvent";
import {VideoFilter} from "@/model/VideoFilter";
import VideosFiltersSelectors from "@/components/filters/VideosFiltersSelectors.vue";
import PageFooter from "@/components/PageFooter.vue";
import {useVideosStore} from "@/stores/videosStore";
import {useOpeningsStore} from "@/stores/openingsStore";
import {usePgnsStore} from "@/stores/pgnsStore";
import {usePositionsStore} from "@/stores/positionsStore";
import Toast from 'primevue/toast';
import {useToast} from 'primevue/usetoast';
import _ from "lodash";

const videosStore = useVideosStore()

const filteredVideos = ref<Array<Video>>([])
const filters = ref<Array<VideoFilter>>([])

const toast = useToast();

function filterVideos() {
  filteredVideos.value = videosStore
      .videos
      .filter(video => filters.value.every(videoFilter => videoFilter.test(video)))
}

const addModifyToast = _.throttle(() => toast.add({severity: 'success', summary: 'Filters modified', life: 3000}), 2000, { 'trailing': false })
const addRemovedToast = _.throttle(() => toast.add({severity: 'success', summary: 'Filter removed', life: 3000}), 100, { 'trailing': false })

function onFiltersModified(event: FiltersModifiedEvent) {
  if (event.filters.length < filters.value.length) {
    addRemovedToast()
  } else if (_.unionWith(filters.value, event.filters, (left, right) => left.equals(right)).length !== filters.value.length || filters.value.length !== event.filters.length) {
    addModifyToast()
  }

  filters.value.length = 0
  filters.value.push(...event.filters)

  filterVideos()
}

videosStore.fetchVideos()
    .then(() => {
      filterVideos()
    }).then(() => useOpeningsStore().fetchOpenings())
    .then(() => {
      usePgnsStore().fetchPgns()
      usePositionsStore().fetchPositions()
    })

</script>

<template>
  <div class="container">
    <Toast/>

    <!-- Description Header Box -->
    <div class="card mt-2 shadow-sm border-0 bg-light">
      <div class="card-body py-2 px-3">
        <h4 class="card-title fw-bold text-primary text-center mb-1">Ajedreznoventa Library</h4>
        <p class="card-text text-muted mb-0 small">
          Welcome! This library indexes and categorizes chess game analysis videos directly from the 
          <a href="https://www.youtube.com/@ajedreznoventa" target="_blank" rel="noopener noreferrer" class="fw-bold text-decoration-none">
            @ajedreznoventa
          </a> 
          YouTube channel. Use the filters below to explore videos by players, head-to-head matchups, or specific chessboard positions.
        </p>
      </div>
    </div>

    <!-- Filters & Pie Chart -->
    <VideosFiltersSelectors :videos="filteredVideos" @filtersModified="onFiltersModified"></VideosFiltersSelectors>
    
    <!-- Videos Table -->
    <VideoTable :videos=filteredVideos></VideoTable>
    
    <!-- Footer -->
    <PageFooter></PageFooter>
  </div>
</template>
